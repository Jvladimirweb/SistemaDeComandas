"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type AutoRefreshProps = {
  itemIds: string[];
};

export default function AutoRefresh({ itemIds }: AutoRefreshProps) {
  const router = useRouter();
  const [soundEnabled, setSoundEnabled] = useState(false);

  const knownItemIds = useRef<Set<string> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const currentIds = new Set(itemIds);

    if (knownItemIds.current === null) {
      knownItemIds.current = currentIds;
      return;
    }

    const hasNewItem = itemIds.some(
      (id) => !knownItemIds.current?.has(id)
    );

    knownItemIds.current = currentIds;

    if (hasNewItem && soundEnabled && audioContextRef.current) {
      const context = audioContextRef.current;
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.frequency.value = 880;
      gain.gain.value = 0.2;

      oscillator.connect(gain);
      gain.connect(context.destination);

      oscillator.start();
      oscillator.stop(context.currentTime + 0.35);
    }
  }, [itemIds, soundEnabled]);

  useEffect(() => {
    const interval = setInterval(() => {
      router.refresh();
    }, 5000);

    return () => clearInterval(interval);
  }, [router]);

  async function enableSound() {
    const context = new AudioContext();
    await context.resume();

    audioContextRef.current = context;
    setSoundEnabled(true);
  }

  return (
    <button
      type="button"
      onClick={enableSound}
      disabled={soundEnabled}
      className="rounded-lg border px-4 py-2 text-sm font-semibold"
    >
      {soundEnabled ? "🔔 Som ativado" : "🔕 Ativar som"}
    </button>
  );
}