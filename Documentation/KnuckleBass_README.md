# KnuckleBass – Setup in HISE

## 1. Load the script (one time)
1. Open the KnuckleBass project in HISE.
2. Find the **Interface** script processor in the Master Chain's MIDI chain. Right-click its header, choose **Connect to external script**, and pick `Scripts/Interface.js`.
   If you'd rather not connect it, open the script editor, select all, and paste in the contents of `Interface.js`.
3. **Compile (F5).** The first compile builds the whole module tree. The console prints *"module tree built"*.
4. **Save the project** (File → Save .hip, plus Export as XML backup if you want one), then **compile again (F5)**.

## 2. Module tree (built and verified in HISE)
```
KnuckleBass (Master Chain)
├─ MIDI: Interface (UI + arpeggiator) -> Scripts/Interface.js
├─ SubOsc (SineSynth)          SubEnv, SubVel | FX: SubShape > SubFilter > SubSat
├─ Harm2  (SineSynth, ratio 2) H2Env, H2Vel   | FX: H2Filter
├─ Harm3  (SineSynth, ratio 3) H3Env, H3Vel   | FX: H3Filter
├─ Grit   (WaveSynth)          GritEnv, GritVel | FX: GritShape > GritFilter > GritSat
└─ FX: Compressor > Chorus > Delay > Reverb > Limiter > Output
```
The script re-uses existing modules on every compile, so recompiling is safe.
The filters (PolyphonicFilter) and saturators sit on each oscillator, because polyphonic filters do nothing in the master chain.
Your own "Sine Wave Generator" is left exactly as it was.

## 3. Pages
| Page | Contents |
|---|---|
| MAIN | Sub osc (level, octave, warmth), 2nd/3rd harmonics, grit layer (level/octave/wave), pulsing subwoofer, volume, velocity, mono, ADSR with a live envelope display |
| EFFECTS | Filter (6 modes), Polyshape (drive + curve), Saturator, Compressor, Limiter, Chorus, Delay, Reverb, Stereo width |
| ARP | On/off, rate (1/4 to 1/32, with triplets), Up/Down/Up-Down/Random/As Played, octaves, gate, swing, step count, 16-step velocity pattern (a step at 0 is a rest) |
| XY PAD | Assign each axis to: Filter Cutoff, Resonance, Polyshape Drive, Saturation, Harmonics, Grit, Delay Mix, Reverb Mix, Chorus Depth. Each axis has its own depth. Cutoff is bipolar around the centre. The other targets add on top of their Effects-page values and switch their effect on while the pad drives them. Double-click the pad to centre it. |

## 4. Presets
Click the preset name in the header to open the browser. Use **<** and **>** to step through presets.
Factory bank: **Subs**, **Growl**, **Arps**, **XY**, 15 presets in all (in `UserPresets/Factory`).

## 5. Woofer animation
`Images/woofer_cone.png` and `Images/woofer_frame.png`. The cone scales with the output level, and every note fires a cyan shock ring.

## Notes
- The project is saved as `XmlPresetBackups/KnuckleBass.xml`.
- If you add your own controls, give them a `defaultValue`. HISE restores controls that have no stored value to that default.
