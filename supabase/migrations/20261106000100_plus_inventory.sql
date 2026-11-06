begin;

alter table public.establishments
  add column if not exists plan_code text not null default 'basic';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'establishments_plan_code_check'
      and conrelid = 'public.establishments'::regclass
  ) then
    alter table public.establishments
      add constraint establishments_plan_code_check
      check (plan_code in ('basic', 'plus'));
  end if;
end;
$$;

alter table public.products
  add column if not exists stock_tracked boolean not null default false,
  add column if not exists stock_quantity numeric(12, 3) not null default 0,
  add column if not exists minimum_stock numeric(12, 3) not null default 0,
  add column if not exists stock_initialized boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'products_stock_quantity_check'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_stock_quantity_check check (stock_quantity >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'products_minimum_stock_check'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_minimum_stock_check check (minimum_stock >= 0);
  end if;
end;
$$;

create table if not exists public.inventory_movements (
  id uuid not null default gen_random_uuid(),
  establishment_id uuid not null,
  product_id uuid not null,
  order_id uuid null,
  order_item_id uuid null,
  movement_type text not null,
  quantity numeric(12, 3) not null,
  description text not null,
  created_by uuid null,
  created_at timestamptz not null default now(),
  constraint inventory_movements_pkey primary key (id),
  constraint inventory_movements_product_establishment_fkey
    foreign key (product_id)
    references public.products (id) on delete cascade,
  constraint inventory_movements_order_fkey
    foreign key (order_id) references public.orders (id) on delete set null,
  constraint inventory_movements_order_item_fkey
    foreign key (order_item_id) references public.order_items (id) on delete set null,
  constraint inventory_movements_created_by_fkey
    foreign key (created_by) references auth.users (id) on delete set null,
  constraint inventory_movements_type_check
    check (movement_type in ('entry', 'withdrawal', 'sale')),
  constraint inventory_movements_quantity_check check (quantity > 0),
  constraint inventory_movements_description_check
    check (length(trim(description)) between 2 and 200)
);

create index if not exists idx_inventory_movements_establishment_created
  on public.inventory_movements (establishment_id, created_at desc);

create index if not exists idx_inventory_movements_product_created
  on public.inventory_movements (product_id, created_at desc);

alter table public.inventory_movements enable row level security;

drop policy if exists inventory_movements_read_members
  on public.inventory_movements;

create policy inventory_movements_read_members
  on public.inventory_movements
  for select
  to authenticated
  using (
    exists (
      select 1
        from public.establishment_members m
       where m.establishment_id = inventory_movements.establishment_id
         and m.user_id = auth.uid()
    )
  );

revoke all on public.inventory_movements from anon, authenticated;
grant select on public.inventory_movements to authenticated;
grant all on public.inventory_movements to service_role;

create or replace function public.configure_product_inventory(
  p_product_id uuid,
  p_track boolean,
  p_initial_quantity numeric,
  p_minimum_quantity numeric
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid;
  v_establishment_id uuid;
  v_plan_code text;
  v_stock_tracked boolean;
  v_stock_initialized boolean;
  v_stock_quantity numeric;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  if p_track is null then
    raise exception 'Configuracao de estoque invalida';
  end if;

  if p_initial_quantity is null or p_initial_quantity < 0
    or p_minimum_quantity is null or p_minimum_quantity < 0 then
    raise exception 'Quantidade de estoque invalida';
  end if;

  select p.establishment_id, p.stock_tracked, p.stock_initialized, p.stock_quantity
    into v_establishment_id, v_stock_tracked, v_stock_initialized, v_stock_quantity
    from public.products p
   where p.id = p_product_id
   for update;

  if not found then
    raise exception 'Produto nao encontrado';
  end if;

  if not exists (
    select 1 from public.establishment_members m
     where m.establishment_id = v_establishment_id
       and m.user_id = v_user_id
  ) then
    raise exception 'Sem acesso ao estabelecimento';
  end if;

  select e.plan_code into v_plan_code
    from public.establishments e
   where e.id = v_establishment_id
   for share;

  if v_plan_code <> 'plus' then
    raise exception 'Recurso disponivel apenas no plano Plus';
  end if;

  if p_track then
    if not v_stock_initialized then
      update public.products
         set stock_tracked = true,
             stock_initialized = true,
             stock_quantity = p_initial_quantity,
             minimum_stock = p_minimum_quantity,
             updated_at = now()
       where id = p_product_id
       returning stock_quantity into v_stock_quantity;

      if p_initial_quantity > 0 then
        insert into public.inventory_movements (
          establishment_id, product_id, movement_type, quantity,
          description, created_by
        ) values (
          v_establishment_id, p_product_id, 'entry', p_initial_quantity,
          'Saldo inicial do controle de estoque', v_user_id
        );
      end if;
    else
      update public.products
         set stock_tracked = true,
             minimum_stock = p_minimum_quantity,
             updated_at = now()
       where id = p_product_id
       returning stock_quantity into v_stock_quantity;
    end if;
  else
    update public.products
       set stock_tracked = false,
           minimum_stock = p_minimum_quantity,
           updated_at = now()
     where id = p_product_id
     returning stock_quantity into v_stock_quantity;
  end if;

  return jsonb_build_object(
    'success', true,
    'stock_tracked', p_track,
    'stock_quantity', v_stock_quantity
  );
end;
$function$;

create or replace function public.record_inventory_movement(
  p_product_id uuid,
  p_movement_type text,
  p_quantity numeric,
  p_description text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid;
  v_establishment_id uuid;
  v_plan_code text;
  v_stock_tracked boolean;
  v_stock_quantity numeric;
  v_next_quantity numeric;
  v_description text;
begin
  v_user_id := auth.uid();
  v_description := trim(coalesce(p_description, ''));

  if v_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  if p_movement_type is null or p_movement_type not in ('entry', 'withdrawal') then
    raise exception 'Tipo de movimentacao invalido';
  end if;

  if p_quantity is null or p_quantity <= 0 or p_quantity > 999999999 then
    raise exception 'Quantidade de estoque invalida';
  end if;

  if length(v_description) not between 2 and 200 then
    raise exception 'Informe uma descricao entre 2 e 200 caracteres';
  end if;

  select p.establishment_id, p.stock_tracked, p.stock_quantity
    into v_establishment_id, v_stock_tracked, v_stock_quantity
    from public.products p
   where p.id = p_product_id
   for update;

  if not found then
    raise exception 'Produto nao encontrado';
  end if;

  if not exists (
    select 1 from public.establishment_members m
     where m.establishment_id = v_establishment_id
       and m.user_id = v_user_id
  ) then
    raise exception 'Sem acesso ao estabelecimento';
  end if;

  select e.plan_code into v_plan_code
    from public.establishments e
   where e.id = v_establishment_id
   for share;

  if v_plan_code <> 'plus' then
    raise exception 'Recurso disponivel apenas no plano Plus';
  end if;

  if not v_stock_tracked then
    raise exception 'Ative o controle de estoque para este produto';
  end if;

  if p_movement_type = 'withdrawal' and v_stock_quantity < p_quantity then
    raise exception 'Estoque insuficiente para esta retirada';
  end if;

  v_next_quantity := case
    when p_movement_type = 'entry' then v_stock_quantity + p_quantity
    else v_stock_quantity - p_quantity
  end;

  update public.products
     set stock_quantity = v_next_quantity,
         updated_at = now()
   where id = p_product_id;

  insert into public.inventory_movements (
    establishment_id, product_id, movement_type, quantity,
    description, created_by
  ) values (
    v_establishment_id, p_product_id, p_movement_type, p_quantity,
    v_description, v_user_id
  );

  return jsonb_build_object(
    'success', true,
    'stock_quantity', v_next_quantity
  );
end;
$function$;

create or replace function public.send_order_items_to_kitchen(
  p_order_id uuid
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid;
  v_establishment_id uuid;
  v_order_number integer;
  v_order_status text;
  v_plan_code text;
  v_dispatch_id uuid;
  v_item_count integer;
  v_stock record;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  select o.establishment_id, o.order_number, o.status
    into v_establishment_id, v_order_number, v_order_status
    from public.orders o
   where o.id = p_order_id
   for update;

  if not found then
    raise exception 'Comanda nao encontrada';
  end if;

  if not exists (
    select 1 from public.establishment_members m
     where m.establishment_id = v_establishment_id
       and m.user_id = v_user_id
  ) then
    raise exception 'Sem acesso ao estabelecimento';
  end if;

  if v_order_status <> 'open' then
    raise exception 'Comanda nao esta aberta';
  end if;

  select e.plan_code into v_plan_code
    from public.establishments e
   where e.id = v_establishment_id
   for share;

  perform oi.id
    from public.order_items oi
   where oi.order_id = p_order_id
     and oi.establishment_id = v_establishment_id
     and oi.status = 'active'
     and oi.kitchen_status = 'not_sent'
   order by oi.id
   for update;

  select count(*)::integer into v_item_count
    from public.order_items oi
   where oi.order_id = p_order_id
     and oi.establishment_id = v_establishment_id
     and oi.status = 'active'
     and oi.kitchen_status = 'not_sent';

  if v_item_count = 0 then
    raise exception 'Nenhum produto novo para enviar';
  end if;

  if v_plan_code = 'plus' then
    perform p.id
      from public.products p
      join public.order_items oi on oi.product_id = p.id
     where oi.order_id = p_order_id
       and oi.establishment_id = v_establishment_id
       and oi.status = 'active'
       and oi.kitchen_status = 'not_sent'
       and p.establishment_id = v_establishment_id
     order by p.id
     for update of p;

    for v_stock in
      select p.id, p.name, p.stock_quantity, required.required_quantity
        from public.products p
        join (
          select oi.product_id, sum(oi.quantity) as required_quantity
            from public.order_items oi
           where oi.order_id = p_order_id
             and oi.establishment_id = v_establishment_id
             and oi.status = 'active'
             and oi.kitchen_status = 'not_sent'
             and oi.product_id is not null
           group by oi.product_id
        ) required on required.product_id = p.id
       where p.establishment_id = v_establishment_id
         and p.stock_tracked = true
       order by p.id
       for update of p
    loop
      if v_stock.stock_quantity < v_stock.required_quantity then
        raise exception 'STOCK_INSUFFICIENT: % (disponivel %, pedido %)',
          v_stock.name, v_stock.stock_quantity, v_stock.required_quantity;
      end if;
    end loop;

    update public.products p
       set stock_quantity = p.stock_quantity - required.required_quantity,
           updated_at = now()
      from (
        select oi.product_id, sum(oi.quantity) as required_quantity
          from public.order_items oi
          join public.products tracked
            on tracked.id = oi.product_id
           and tracked.establishment_id = oi.establishment_id
         where oi.order_id = p_order_id
           and oi.establishment_id = v_establishment_id
           and oi.status = 'active'
           and oi.kitchen_status = 'not_sent'
           and oi.product_id is not null
           and tracked.stock_tracked = true
         group by oi.product_id
      ) required
     where p.id = required.product_id
       and p.establishment_id = v_establishment_id;

    insert into public.inventory_movements (
      establishment_id, product_id, order_id, order_item_id,
      movement_type, quantity, description, created_by
    )
    select oi.establishment_id,
           oi.product_id,
           oi.order_id,
           oi.id,
           'sale',
           oi.quantity,
           'Pedido #' || v_order_number::text || ' enviado para preparo',
           v_user_id
      from public.order_items oi
      join public.products p
        on p.id = oi.product_id
       and p.establishment_id = oi.establishment_id
       and p.stock_tracked = true
     where oi.order_id = p_order_id
       and oi.establishment_id = v_establishment_id
       and oi.status = 'active'
       and oi.kitchen_status = 'not_sent';
  end if;

  insert into public.kitchen_dispatches (
    establishment_id, order_id, sent_by
  ) values (
    v_establishment_id, p_order_id, v_user_id
  ) returning id into v_dispatch_id;

  insert into public.kitchen_dispatch_items (
    dispatch_id, order_item_id, product_name, quantity
  )
  select v_dispatch_id, oi.id, oi.product_name, oi.quantity
    from public.order_items oi
   where oi.order_id = p_order_id
     and oi.establishment_id = v_establishment_id
     and oi.status = 'active'
     and oi.kitchen_status = 'not_sent';

  update public.order_items
     set kitchen_status = 'pending',
         sent_to_kitchen_at = now(),
         sent_to_kitchen_by = v_user_id
   where order_id = p_order_id
     and establishment_id = v_establishment_id
     and status = 'active'
     and kitchen_status = 'not_sent';

  return v_dispatch_id;
end;
$function$;

revoke all on function public.configure_product_inventory(uuid, boolean, numeric, numeric) from public;
revoke all on function public.record_inventory_movement(uuid, text, numeric, text) from public;
revoke all on function public.send_order_items_to_kitchen(uuid) from public;

grant execute on function public.configure_product_inventory(uuid, boolean, numeric, numeric) to authenticated;
grant execute on function public.record_inventory_movement(uuid, text, numeric, text) to authenticated;
grant execute on function public.send_order_items_to_kitchen(uuid) to authenticated;

commit;
