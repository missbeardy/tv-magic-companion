// src/hooks/useConfetti.ts
// Reusable confetti trigger — platform-level celebration effect.
// Any page/component can call fireConfetti() to celebrate a moment
// (job completion, new sign-up, hitting a target, etc.)

import confetti from 'canvas-confetti';

interface FireConfettiOptions {
  colors?: string[];
}

export function useConfetti() {
  const fireConfetti = (options?: FireConfettiOptions) => {
    const colors = options?.colors ?? ['#004B93', '#00B4C5', '#FFC107', '#4CAF50'];

    // Two staggered bursts from bottom-left and bottom-right —
    // reads as a "celebration" rather than a single flat pop.
    const duration = 1500;
    const end = Date.now() + duration;

    (function frame() {
      confetti({
        particleCount: 4,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.9 },
        colors,
      });
      confetti({
        particleCount: 4,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.9 },
        colors,
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    })();
  };

  return { fireConfetti };
}