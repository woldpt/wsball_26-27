export const playNotification = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [880, 1100].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.13);
      gain.gain.setValueAtTime(0.07, ctx.currentTime + i * 0.13);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        ctx.currentTime + i * 0.13 + 0.22,
      );
      osc.start(ctx.currentTime + i * 0.13);
      osc.stop(ctx.currentTime + i * 0.13 + 0.22);
    });
  } catch {
    // ignore
  }
};

// Som especial para golos — mais grave, forte e memorável
export const playGoalSound = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    // Sequência: nota curta de impacto + nota longa de celebração
    const sequence = [
      { freq: 523, time: 0, dur: 0.12, vol: 0.25 }, // Dó
      { freq: 659, time: 0.1, dur: 0.12, vol: 0.22 }, // Mi
      { freq: 784, time: 0.2, dur: 0.35, vol: 0.28 }, // Sol (nota de celebração)
    ];
    sequence.forEach(({ freq, time, dur, vol }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + time);
      gain.gain.setValueAtTime(vol, ctx.currentTime + time);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        ctx.currentTime + time + dur,
      );
      osc.start(ctx.currentTime + time);
      osc.stop(ctx.currentTime + time + dur);
    });
  } catch {
    // ignore
  }
};

// Som descendente para golo anulado pelo VAR
export const playVarSound = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const sequence = [
      { freq: 440, time: 0, dur: 0.16, vol: 0.11 },
      { freq: 330, time: 0.15, dur: 0.32, vol: 0.09 },
    ];
    sequence.forEach(({ freq, time, dur, vol }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + time);
      gain.gain.setValueAtTime(vol, ctx.currentTime + time);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        ctx.currentTime + time + dur,
      );
      osc.start(ctx.currentTime + time);
      osc.stop(ctx.currentTime + time + dur);
    });
  } catch {
    // ignore
  }
};
