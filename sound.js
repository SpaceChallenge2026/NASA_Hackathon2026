'use strict';
(() => {
  const byId = id => document.getElementById(id);
  const control = byId('sound-control');
  const panel = byId('sound-panel');
  const settings = byId('sound-settings');
  const master = byId('sound-master');
  const status = byId('sound-status');
  const channels = {
    music: {toggle: byId('sound-music'), volume: byId('music-volume')},
    effects: {toggle: byId('sound-effects'), volume: byId('effects-volume')},
  };
  const mixes = {
    overview: [.80, .65, .13], focus: [.78, .75, .19], atlas: [.76, .78, .62],
    discover: [.67, .99, .86], investigate: [.73, .55, .055],
  };
  const stage = {overview: 1, focus: 1, atlas: 2, discover: 3, investigate: 4};
  const stemNames = ['breath', 'harmony', 'figure'];
  const cueNames = ['select', 'confirm', 'expand', 'transition'];
  const storageKey = 'elsewhere-sound-prototype-mix-v1';
  let context, loading, ready = false, enabled = false, voice = null;
  let scene = 'overview', world = '';
  const buffers = {};
  const stems = [];
  let buses, warmth;

  function restoreMix() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey));
      for (const [name, {toggle, volume}] of Object.entries(channels)) {
        if (typeof saved?.[name]?.on === 'boolean') toggle.checked = saved[name].on;
        if (Number.isFinite(saved?.[name]?.volume)) volume.value = saved[name].volume;
      }
    } catch { /* Storage may be unavailable. */ }
  }

  function saveMix() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(
        Object.entries(channels).map(([name, {toggle, volume}]) => [name, {on: toggle.checked, volume: volume.valueAsNumber}]),
      )));
    } catch { /* Playback is independent of storage. */ }
  }

  function ramp(param, value, duration) {
    const now = context.currentTime;
    if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(now);
    else {
      const current = param.value;
      param.cancelScheduledValues(now);
      param.setValueAtTime(current, now);
    }
    param.linearRampToValueAtTime(value, now + duration);
  }

  function applyVolumes() {
    if (!buses) return;
    for (const [name, {toggle, volume}] of Object.entries(channels)) {
      const level = enabled && ready && toggle.checked ? (volume.valueAsNumber / 100) ** 1.35 : 0;
      ramp(buses[name].gain, level, name === 'music' ? .18 : .045);
    }
    if (!enabled || !channels.effects.toggle.checked || channels.effects.volume.valueAsNumber === 0) releaseVoice();
  }

  function syncPanel(message) {
    control.toggleAttribute('data-active', enabled && ready);
    master.setAttribute('aria-pressed', String(enabled));
    master.textContent = enabled ? 'Sound on' : 'Sound off';
    status.textContent = message ?? (enabled ? (ready ? 'Sound enabled.' : 'Loading the score and cues…') : 'Enable sound to hear the score and interactions.');
  }

  async function loadBuffer(name) {
    const response = await fetch(`audio/${name}.wav?v=r05`);
    if (!response.ok) throw new Error(`Could not read ${name}.wav (${response.status})`);
    return context.decodeAudioData(await response.arrayBuffer());
  }

  async function loadAudio() {
    const names = [...stemNames, ...cueNames];
    const clips = await Promise.all(names.map(loadBuffer));
    for (let i = 0; i < names.length; i++) buffers[names[i]] = clips[i];
    if (stemNames.some(name => buffers[name].length !== buffers.breath.length)) throw new Error('The score layers differ in length');

    buses = {music: context.createGain(), effects: context.createGain()};
    for (const bus of Object.values(buses)) {
      bus.gain.value = 0;
      bus.connect(context.destination);
    }
    warmth = context.createBiquadFilter();
    warmth.type = 'peaking';
    warmth.frequency.value = 390;
    warmth.Q.value = .78;
    warmth.gain.value = scene === 'discover' ? 2.5 : 0;
    warmth.connect(buses.music);
    const start = context.currentTime + .045;
    for (const [i, name] of stemNames.entries()) {
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = buffers[name];
      source.loop = true;
      gain.gain.value = mixes[scene][i];
      source.connect(gain).connect(name === 'harmony' ? warmth : buses.music);
      source.start(start);
      stems.push(gain);
    }
    ready = true;
  }

  async function toggleSound() {
    enabled = !enabled;
    syncPanel();
    if (!enabled) { applyVolumes(); return; }
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      context ??= new Audio();
      await context.resume();
      if (!ready) {
        loading ??= loadAudio().finally(() => { loading = null; });
        await loading;
      }
      applyVolumes();
      syncPanel();
    } catch (error) {
      enabled = false;
      syncPanel(location.protocol === 'file:' ? 'Open this prototype with Start Sound Prototype.cmd.' : 'Sound could not load. Select Sound off to try again.');
      console.error(error);
    }
  }

  function releaseVoice() {
    if (!voice) return;
    ramp(voice.gain.gain, 0, .045);
    voice.source.stop(context.currentTime + .05);
    voice = null;
  }

  function cue(name, {level = 1, body = '', rate = 1} = {}) {
    if (!ready || !enabled || !channels.effects.toggle.checked || channels.effects.volume.valueAsNumber === 0) return;
    releaseVoice();
    const source = context.createBufferSource();
    const gain = context.createGain();
    gain.gain.value = level;
    source.buffer = buffers[name];
    source.playbackRate.value = rate;
    if (body) {
      const color = context.createBiquadFilter();
      color.type = body === 'moon' ? 'highpass' : 'lowpass';
      color.frequency.value = body === 'moon' ? 48 : 350;
      color.Q.value = .65;
      source.connect(color).connect(gain);
    } else source.connect(gain);
    gain.connect(buses.effects);
    source.onended = () => { if (voice?.source === source) voice = null; };
    voice = {source, gain};
    source.start();
  }

  function changeScene(next, nextWorld, {quiet = false} = {}) {
    const prev = scene;
    const prevWorld = world;
    scene = next;
    world = nextWorld;
    if (prev === scene && prevWorld === world) return;
    if (ready) {
      stems.forEach((stem, i) => ramp(stem.gain, mixes[scene][i], 1.55));
      ramp(warmth.gain, scene === 'discover' ? 2.5 : 0, 1.55);
    }
    if (quiet) return;
    if (stage[prev] !== stage[scene]) {
      const forward = stage[scene] > stage[prev];
      cue('transition', {level: forward ? .78 : .60, body: prev === 'focus' || scene === 'focus' ? world : ''});
    } else if (scene === 'focus') {
      cue('transition', {level: .40, body: world, rate: world === 'moon' ? 1.04 : .97});
    }
  }

  function setPanel(open, moveFocus = false) {
    settings.setAttribute('aria-expanded', String(open));
    panel.hidden = !open;
    if (moveFocus) (open ? master : settings).focus();
  }

  restoreMix();
  settings.addEventListener('click', () => setPanel(panel.hidden, panel.hidden));
  master.addEventListener('click', toggleSound);
  byId('sound-review')?.addEventListener('click', () => {
    enabled = false;
    applyVolumes();
    syncPanel();
  });
  for (const {toggle, volume} of Object.values(channels)) {
    toggle.addEventListener('change', () => { applyVolumes(); saveMix(); });
    volume.addEventListener('input', () => { applyVolumes(); saveMix(); });
  }
  document.addEventListener('click', event => {
    if (!panel.hidden && !control.contains(event.target)) setPanel(false);
    const summary = event.target.closest('summary');
    if (summary?.parentElement.matches('details:not([open])') && !control.contains(summary)) cue('expand');
    if (event.target.closest('#go-comparison')) cue('expand');
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || panel.hidden) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    setPanel(false, true);
  }, true);
  window.ElsewhereSound = {scene: changeScene, cue};
})();
