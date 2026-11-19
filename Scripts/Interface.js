Content.makeFrontInterface(1000, 680);

/*  =====================================================================
    KNUCKLEBASS  -  Sub Bass Synth  (HISE)
    ---------------------------------------------------------------------
    Pages : MAIN | EFFECTS | ARP | XY PAD
    Engine: Sub sine + 2nd/3rd harmonic sines + grit wave layer
    FX    : Polyshape > Filter > Saturator (per osc) > Compressor >
            Chorus > Delay > Reverb > Limiter > Output
    On the first compile this script builds the whole module tree with
    the Builder API. Compile a second time (F5) after the first build.
    ===================================================================== */

// ---------------------------------------------------------------------
// 1. CONSTANTS & STATE
// ---------------------------------------------------------------------
const var CYAN      = 0xFF00E5FF;
const var CYAN_DARK = 0xFF00363D;
const var EDGE      = 0xFF16343A;
const var TEXT      = 0xFFCFF7FC;
const var TEXT_DIM  = 0xFF7FA5AB;

const var T_CUTOFF = 0;
const var T_RES    = 1;
const var T_DRIVE  = 2;
const var T_SAT    = 3;
const var T_HARM   = 4;
const var T_GRIT   = 5;
const var T_DELAY  = 6;
const var T_REVERB = 7;
const var T_CHORUS = 8;
const var NUM_TARGETS = 9;
const var TARGET_NAMES = ["Filter Cutoff", "Resonance", "Polyshape Drive", "Saturation",
                          "Harmonics", "Grit", "Delay Mix", "Reverb Mix", "Chorus Depth"];

const var PAGE_NAMES   = ["MAIN", "EFFECTS", "EQ", "ARP", "XY PAD"];
const var EQ_TYPES     = ["Low Pass", "High Pass", "Low Shelf", "High Shelf", "Peak"];
const var EQ_MAX_BANDS = 8;
// 5 flat bands: HP 25 Hz, low shelf 70 Hz, peak 250 Hz, peak 1.2 kHz, high shelf 6 kHz
const var EQ_DEFAULT_STATE = "222.3ocYRtjCBBCD.cFURzcdB7LXqePVIAERbiQS7BfRMRBBHULgcdF7x3VOMt1ifRQsj1t7kYd4k1tJKYGiySx.r2lhTFfcLlkmcg4dBVLGvVFtqAmhTeNmE.H1bY9QuvnyrLNfFnA.fiebP+O60B9dJADIvxtDPKA6EmmSKACjS7R.FpBFoJc7ev00BolpRmn5vplCwJD8TksZmTMCUUCQqVRsb6VskVuDYvOtUMiolGsjIVploZMSkMmduZFsKXpVyzZM211yaiar+1Hw6ZCDmcHLJX0u+Cb.f2vurIl4";
const var FILTER_NAMES = ["Moog LP", "Ladder LP", "SVF LP", "Reso LP", "SVF HP", "SVF BP"];
const var FILTER_MODES = [8, 15, 6, 5, 7, 13];          // HISE FilterBank mode indexes
const var SHAPE_NAMES  = ["Atan", "Tanh", "Square", "Square Root", "Saturate", "Sine"];
const var SHAPE_VALUES = [2, 3, 7, 8, 6, 4];         // ShapeFX::ShapeMode
const var WAVE_NAMES   = ["Saw", "Square", "Triangle"];
const var WAVE_VALUES  = [3, 4, 2];                    // WaveSynth waveform indexes
const var RATE_NAMES   = ["1/2", "1/4", "1/4 D", "1/8", "1/8 D", "1/8 T", "1/16", "1/16 D", "1/16 T", "1/32", "1/32 T"];
const var RATE_QUARTERS = [2.0, 1.0, 1.5, 0.5, 0.75, 0.3333333, 0.25, 0.375, 0.1666667, 0.125, 0.0833333];
const var ARP_MODES    = ["Up", "Down", "Up / Down", "Random", "As Played", "Chord"];
const var VEL_MODES    = ["Played x Step", "Step Lane", "Played"];
const var RANDOM_PITCHES = [0, 0, 0, 0, 12, 12, 7, -12, 5, 0, 3, 0];

const var allControls = [];

// arp state (written on the audio thread, read by the UI)
const var isHeld   = [];
const var order    = [];
const var pat      = [];
const var stepVel  = [];
const var stepPitch = [];
const var stepGate = [];
const var phys     = [];
const var arp      = {"running": 0, "step": 0, "noteIdx": 0, "vel": 100, "display": -1,
                      "physCount": 0, "latchRelease": 0};
const var vis      = {"hits": 0};
const var eqState  = {"band": 0, "num": 0};
reg arpLaneTick = 0;

isHeld.reserve(128);
order.reserve(128);
pat.reserve(1024);
stepVel.reserve(16);
stepPitch.reserve(16);
stepGate.reserve(16);
phys.reserve(128);
for (i = 0; i < 128; i++) { isHeld.push(0); phys.push(0); }
for (i = 0; i < 16; i++)  { stepVel.push(1.0); stepPitch.push(0); stepGate.push(1.0); }

// ---------------------------------------------------------------------
// 2. MODULE TREE (built automatically on the first compile)
// ---------------------------------------------------------------------
inline function buildModules()
{
	// Builder.create() re-uses a module if one with that ID already exists,
	// so this is safe to run on every compile.
	local b  = Synth.createBuilder();
	local ci = b.ChainIndexes;
	local isNew = Synth.getIdList("Sine Wave Generator").indexOf("SubOsc") == -1;

	local sub  = b.create("SineSynth", "SubOsc", 0, ci.Direct);
	local h2   = b.create("SineSynth", "Harm2",  0, ci.Direct);
	local h3   = b.create("SineSynth", "Harm3",  0, ci.Direct);
	local grit = b.create("WaveSynth", "Grit",   0, ci.Direct);

	if (isNew)
	{
		b.clearChildren(sub,  ci.Gain);
		b.clearChildren(h2,   ci.Gain);
		b.clearChildren(h3,   ci.Gain);
		b.clearChildren(grit, ci.Gain);
	}

	b.create("AHDSR",    "SubEnv",  sub,  ci.Gain);
	b.create("Velocity", "SubVel",  sub,  ci.Gain);
	b.create("AHDSR",    "H2Env",   h2,   ci.Gain);
	b.create("Velocity", "H2Vel",   h2,   ci.Gain);
	b.create("AHDSR",    "H3Env",   h3,   ci.Gain);
	b.create("Velocity", "H3Vel",   h3,   ci.Gain);
	b.create("AHDSR",    "GritEnv", grit, ci.Gain);
	b.create("Velocity", "GritVel", grit, ci.Gain);

	// LOW END: sub-octave layer + pitch "punch" envelopes
	local deepNew = Synth.getIdList("Sine Wave Generator").indexOf("DeepOsc") == -1;
	local deep = b.create("SineSynth", "DeepOsc", 0, ci.Direct);
	if (deepNew) b.clearChildren(deep, ci.Gain);
	b.create("AHDSR",    "DeepEnv",   deep, ci.Gain);
	b.create("Velocity", "DeepVel",   deep, ci.Gain);
	b.create("AHDSR",    "SubPitch",  sub,  ci.Pitch);
	b.create("AHDSR",    "H2Pitch",   h2,   ci.Pitch);
	b.create("AHDSR",    "H3Pitch",   h3,   ci.Pitch);
	b.create("AHDSR",    "GritPitch", grit, ci.Pitch);
	b.create("AHDSR",    "DeepPitch", deep, ci.Pitch);

	b.create("PolyshapeFX",      "SubShape",   sub,  ci.FX);
	b.create("PolyshapeFX",      "GritShape",  grit, ci.FX);
	b.create("PolyphonicFilter", "SubFilter",  sub,  ci.FX);
	b.create("PolyphonicFilter", "H2Filter",   h2,   ci.FX);
	b.create("PolyphonicFilter", "H3Filter",   h3,   ci.FX);
	b.create("PolyphonicFilter", "GritFilter", grit, ci.FX);

	b.create("Saturator",        "SubSat",     sub,  ci.FX);
	b.create("Saturator",        "GritSat",    grit, ci.FX);

	// master chain (only created if missing, never rearranged)
	b.create("Dynamics",     "Compressor", 0, ci.FX);
	b.create("Chorus",       "Chorus",     0, ci.FX);
	b.create("Delay",        "Delay",      0, ci.FX);
	b.create("SimpleReverb", "Reverb",     0, ci.FX);
	b.create("Dynamics",     "Limiter",    0, ci.FX);
	b.create("SimpleGain",   "Output",     0, ci.FX);

	b.flush();
}

buildModules();

const var SubOsc   = Synth.getChildSynth("SubOsc");
const var Harm2Osc = Synth.getChildSynth("Harm2");
const var Harm3Osc = Synth.getChildSynth("Harm3");
const var GritOsc  = Synth.getChildSynth("Grit");

const var DeepOsc  = Synth.getChildSynth("DeepOsc");

const var envs = [Synth.getModulator("SubEnv"), Synth.getModulator("H2Env"),
                  Synth.getModulator("H3Env"),  Synth.getModulator("GritEnv"),
                  Synth.getModulator("DeepEnv")];
const var vels = [Synth.getModulator("SubVel"), Synth.getModulator("H2Vel"),
                  Synth.getModulator("H3Vel"),  Synth.getModulator("GritVel"),
                  Synth.getModulator("DeepVel")];
const var pitchEnvs = [Synth.getModulator("SubPitch"), Synth.getModulator("H2Pitch"),
                       Synth.getModulator("H3Pitch"),  Synth.getModulator("GritPitch"),
                       Synth.getModulator("DeepPitch")];
const var synths = [SubOsc, Harm2Osc, Harm3Osc, GritOsc, DeepOsc];

// pitch envelopes: instant attack, fall back to the played pitch
for (pe in pitchEnvs)
{
	pe.setAttribute(pe.Attack, 0);
	pe.setAttribute(pe.Hold, 0);
	pe.setAttribute(pe.Sustain, -100);
	pe.setAttribute(pe.Release, 20);
}

const var SubShape   = Synth.getEffect("SubShape");
const var GritShape  = Synth.getEffect("GritShape");
const var filters    = [Synth.getEffect("SubFilter"), Synth.getEffect("H2Filter"),
                        Synth.getEffect("H3Filter"),  Synth.getEffect("GritFilter")];
const var sats       = [Synth.getEffect("SubSat"), Synth.getEffect("GritSat")];
const var Compressor = Synth.getEffect("Compressor");
const var Chorus     = Synth.getEffect("Chorus");
const var Delay      = Synth.getEffect("Delay");
const var Reverb     = Synth.getEffect("Reverb");
const var Limiter    = Synth.getEffect("Limiter");
const var Output     = Synth.getEffect("Output");

// use an existing Parametriq EQ if there is one, otherwise add "EQ" before the compressor
const var eqIds = Synth.getIdList("Parametriq EQ");
const var EQ_ID = eqIds.indexOf("EQ") != -1 ? "EQ" : (eqIds.length > 0 ? eqIds[0] : "EQ");

if (eqIds.length == 0)
	Synth.addEffect("CurveEq", EQ_ID, 0);

const var EQ = Synth.getEffect(EQ_ID);

if (EQ.getNumAttributes() == 0)
	EQ.restoreState(EQ_DEFAULT_STATE);

// the EQ bands are stored in user presets as a module state
Engine.addModuleStateToUserPreset(EQ_ID);

// fixed engine settings
Harm2Osc.setAttribute(Harm2Osc.UseFreqRatio, 1);
Harm2Osc.setAttribute(Harm2Osc.CoarseFreqRatio, 2);
Harm3Osc.setAttribute(Harm3Osc.UseFreqRatio, 1);
Harm3Osc.setAttribute(Harm3Osc.CoarseFreqRatio, 3);
GritOsc.setAttribute(GritOsc.EnableSecondOscillator, 0);
GritOsc.setAttribute(GritOsc.Mix, 0.0);

Compressor.setAttribute(Compressor.GateEnabled, 0);
Compressor.setAttribute(Compressor.CompressorEnabled, 1);
Compressor.setAttribute(Compressor.LimiterEnabled, 0);
Limiter.setAttribute(Limiter.GateEnabled, 0);
Limiter.setAttribute(Limiter.CompressorEnabled, 0);
Limiter.setAttribute(Limiter.LimiterEnabled, 1);
Limiter.setAttribute(Limiter.LimiterAttack, 1.0);

Reverb.setAttribute(Reverb.DryLevel, 1.0);
Delay.setAttribute(Delay.TempoSync, 0);
Delay.setAttribute(Delay.LowPassFreq, 6000);
Delay.setAttribute(Delay.HiPassFreq, 80);

// ---------------------------------------------------------------------
// 3. LOOK AND FEEL
// ---------------------------------------------------------------------
const var laf = Engine.createGlobalScriptLookAndFeel();
// 3D knob body rendered in Blender (skirt = 78% of the image width)
laf.loadImage("{PROJECT_FOLDER}kb3d_knob.png", "knob3d");

// value text shown under the big knobs
const var KNOB_FMT = {
	"SubLevel": "pct", "SubOct": "oct", "SubDrive": "pct", "Harm2": "pct", "Harm3": "pct",
	"GritLevel": "pct", "GritOct": "oct", "Volume": "db", "VelSens": "pct",
	"Attack": "ms", "Decay": "ms", "Sustain": "pct100", "Release": "ms",
	"PunchAmt": "st", "PunchTime": "ms", "DeepLevel": "pct",
	"Cutoff": "hz", "Resonance": "q", "ShapeDrive": "db", "SatAmount": "pct", "SatMix": "pct",
	"CompThresh": "db", "CompRatio": "ratio", "CompAttack": "ms", "CompRelease": "ms",
	"LimCeiling": "db", "LimRelease": "ms", "ChorusRate": "pct", "ChorusDepth": "pct",
	"DelayTime": "ms", "DelayFeedback": "pct", "DelayMix": "pct",
	"ReverbSize": "pct", "ReverbMix": "pct", "Width": "pct100",
	"EqGain": "db", "EqFreq": "hz", "EqQ": "q"
};

inline function knobText(id, v)
{
	local f = KNOB_FMT[id];
	local t = "";
	if (f == "pct")         t = "" + parseInt(Math.round(v * 100)) + " %";
	else if (f == "pct100") t = "" + parseInt(Math.round(v)) + " %";
	else if (f == "db")     t = Engine.doubleToString(v, 1) + " dB";
	else if (f == "ms")
	{
		if (v >= 1000) t = Engine.doubleToString(v / 1000, 2) + " s";
		else if (v < 10) t = Engine.doubleToString(v, 1) + " ms";
		else t = "" + parseInt(Math.round(v)) + " ms";
	}
	else if (f == "hz")
	{
		if (v >= 1000) t = Engine.doubleToString(v / 1000, 2) + " kHz";
		else t = "" + parseInt(Math.round(v)) + " Hz";
	}
	else if (f == "oct")    t = (v > 0 ? "+" : "") + parseInt(Math.round(v)) + " oct";
	else if (f == "st")     t = "+" + Engine.doubleToString(v, 1) + " st";
	else if (f == "ratio")  t = Engine.doubleToString(v, 1) + " : 1";
	else if (f == "q")      t = Engine.doubleToString(v, 2);
	return t;
}

laf.registerFunction("drawRotarySlider", function(g, obj)
{
	var a = obj.area;
	var big = a[3] >= 90;
	var reserve = big ? 32 : 18;
	var ring = big ? 4 : 3;
	// big knobs: keep the tick dots and glow inside the component (pad = ring + tick gap)
	var pad = big ? ring + 8 : 0;
	var s = big ? Math.min(a[2], a[3] - reserve) - pad * 2 : Math.min(a[2], a[3] - reserve) - 10;
	var x = (a[2] - s) / 2;
	var y = big ? pad : 5;
	var cx = x + s / 2;
	var cy = y + s / 2;
	var start = -2.35;
	var range = 4.7;
	var end = start + range * obj.valueNormalized;
	var arcArea = [x - ring, y - ring, s + ring * 2, s + ring * 2];

	// tick dots around the scale (big knobs only)
	if (big)
	{
		for (i = 0; i <= 10; i++)
		{
			var ta = start + range * i / 10;
			var tr = s / 2 + ring + 4.5;
			var lit = (i / 10) <= obj.valueNormalized + 0.001;
			g.setColour(lit ? Colours.withAlpha(CYAN, 0.8) : 0xFF1A3036);
			g.fillEllipse([cx + Math.sin(ta) * tr - 1.2, cy - Math.cos(ta) * tr - 1.2, 2.4, 2.4]);
		}
	}

	// soft cyan glow behind the knob, stronger as the value rises
	g.setColour(Colours.withAlpha(CYAN, 0.02 + 0.06 * obj.valueNormalized + (obj.hover ? 0.04 : 0.0)));
	g.fillEllipse([x - 6, y - 6, s + 12, s + 12]);

	var track = Content.createPath();
	track.startNewSubPath(0.0, 0.0);
	track.startNewSubPath(1.0, 1.0);
	track.addArc([0.0, 0.0, 1.0, 1.0], start, start + range);
	g.setColour(0xFF10262B);
	g.drawPath(track, arcArea, ring);

	if (obj.valueNormalized > 0.004)
	{
		var val = Content.createPath();
		val.startNewSubPath(0.0, 0.0);
		val.startNewSubPath(1.0, 1.0);
		val.addArc([0.0, 0.0, 1.0, 1.0], start, end);
		g.setColour(Colours.withAlpha(CYAN, 0.18));
		g.drawPath(val, arcArea, ring * 3);
		g.setColour(CYAN);
		g.drawPath(val, arcArea, ring * 0.85);
	}

	// rendered 3D knob body
	var inset = big ? 8 : 6;
	var ks = s / 0.78;
	g.setColour(0xFFFFFFFF);
	g.drawImage("knob3d", [cx - ks / 2, cy - ks / 2, ks, ks], 0, 0);
	if (obj.hover)
	{
		g.setColour(Colours.withAlpha(CYAN, 0.10));
		g.fillEllipse([x + 2, y + 2, s - 4, s - 4]);
	}

	// pointer: glowing cyan line on the cap
	var r1 = s * 0.36;
	var r2 = s * 0.14;
	g.setColour(Colours.withAlpha(CYAN, 0.35));
	g.drawLine(cx + Math.sin(end) * r2, cx + Math.sin(end) * r1,
	           cy - Math.cos(end) * r2, cy - Math.cos(end) * r1, big ? 6 : 5);
	g.setColour(0xFFB8F7FF);
	g.drawLine(cx + Math.sin(end) * r2, cx + Math.sin(end) * r1,
	           cy - Math.cos(end) * r2, cy - Math.cos(end) * r1, big ? 2.4 : 2);

	if (big)
	{
		g.setFont("Oxygen Bold", 10);
		g.setColour(obj.hover ? 0xFFFFFFFF : TEXT_DIM);
		g.drawAlignedText(obj.text, [0, a[3] - 29, a[2], 13], "centred");

		var vt = knobText(obj.id, obj.value);
		if (vt == "") vt = obj.valueAsText;
		g.setColour(0xFF061214);
		g.fillRoundedRectangle([4, a[3] - 15, a[2] - 8, 14], 3);
		g.setFont("Oxygen Bold", 10);
		g.setColour(obj.hover ? 0xFFFFFFFF : CYAN);
		g.drawAlignedText(vt, [0, a[3] - 15, a[2], 14], "centred");
	}
	else
	{
		g.setFont("Oxygen Bold", 11);
		g.setColour(obj.hover ? CYAN : TEXT_DIM);
		g.drawAlignedText(obj.text, [0, a[3] - 16, a[2], 14], "centred");
	}
});

laf.registerFunction("drawToggleButton", function(g, obj)
{
	var a = obj.area;
	var on = obj.value;
	// raised bevelled key: drop shadow, gradient body, top highlight
	g.setColour(0x90000000);
	g.fillRoundedRectangle([1, 2, a[2] - 1, a[3] - 2], 4);
	if (on)
		g.setGradientFill([0xFF00505A, 0, 0, 0xFF002A30, 0, a[3], false]);
	else
		g.setGradientFill([obj.over ? 0xFF243038 : 0xFF1B242A, 0, 0, 0xFF080C0E, 0, a[3], false]);
	g.fillRoundedRectangle([0.5, 0.5, a[2] - 1, a[3] - 2], 4);
	g.setColour(on ? 0x60B8F7FF : 0x22FFFFFF);
	g.fillRect([4, 1, a[2] - 8, 1]);
	g.setColour(on ? CYAN : (obj.over ? 0xFF2E5A62 : 0xFF1E3A40));
	g.drawRoundedRectangle([0.5, 0.5, a[2] - 1, a[3] - 2], 4, 1);
	if (on)
	{
		g.setColour(Colours.withAlpha(CYAN, 0.35));
		g.fillEllipse([6, a[3] / 2 - 6, 12, 12]);
	}
	g.setColour(on ? CYAN : 0xFF24393D);
	g.fillEllipse([9, a[3] / 2 - 3, 6, 6]);
	g.setFont("Oxygen Bold", 11);
	g.setColour(on ? 0xFFE6FDFF : TEXT_DIM);
	g.drawAlignedText(obj.text, [18, 0, a[2] - 22, a[3]], "centred");
});

laf.registerFunction("drawComboBox", function(g, obj)
{
	var a = obj.area;
	var r = [a[0] + 0.5, a[1] + 0.5, a[2] - 1, a[3] - 1];
	g.setColour(0xFF0A1012);
	g.fillRoundedRectangle(r, 4);
	g.setColour(obj.hover ? CYAN : 0xFF1E3A40);
	g.drawRoundedRectangle(r, 4, 1);
	g.setFont("Oxygen Bold", 12);
	g.setColour(TEXT);
	g.drawAlignedText(obj.text, [a[0] + 10, a[1], a[2] - 30, a[3]], "left");
	g.setColour(CYAN);
	g.fillTriangle([a[0] + a[2] - 20, a[1] + a[3] / 2 - 3, 9, 6], Math.PI);
});

laf.registerFunction("drawPopupMenuBackground", function(g, obj)
{
	g.setColour(0xFF05090A);
	g.fillRect([0, 0, obj.width, obj.height]);
	g.setColour(0xFF1E3A40);
	g.drawRect([0, 0, obj.width, obj.height], 1);
});

laf.registerFunction("drawPopupMenuItem", function(g, obj)
{
	var a = obj.area;
	if (obj.isSeparator)
	{
		g.setColour(0xFF1E3A40);
		g.fillRect([a[0] + 8, a[1] + a[3] / 2, a[2] - 16, 1]);
	}
	else
	{
		if (obj.isHighlighted)
		{
			g.setColour(CYAN_DARK);
			g.fillRect(a);
		}
		g.setFont("Oxygen Bold", 12);
		g.setColour(obj.isTicked ? CYAN : TEXT);
		g.drawAlignedText(obj.text, [a[0] + 14, a[1], a[2] - 28, a[3]], "left");
	}
});

// tabs + small arrow buttons
const var tabLaf = Content.createLocalLookAndFeel();
tabLaf.registerFunction("drawToggleButton", function(g, obj)
{
	var a = obj.area;
	var on = obj.value;
	if (on)
	{
		g.setGradientFill([0x0000E5FF, 0, 0, 0x3300E5FF, 0, a[3], false]);
		g.fillRect([0, 0, a[2], a[3]]);
		g.setColour(CYAN);
		g.fillRect([0, a[3] - 3, a[2], 3]);
	}
	g.setFont("Oxygen Bold", 13);
	g.setColour(on ? CYAN : (obj.over ? TEXT : TEXT_DIM));
	g.drawAlignedText(obj.text, [0, 0, a[2], a[3]], "centred");
});

// combo boxes + their popup menus (this HISE build ignores the global LAF for combos)
const var comboLaf = Content.createLocalLookAndFeel();

const var drawComboFn = function(g, obj)
{
	var a = obj.area;
	var r = [a[0] + 0.5, a[1] + 0.5, a[2] - 1, a[3] - 1];
	var hot = obj.hover;

	g.setGradientFill([0xFF0C1417, 0, a[1], 0xFF050809, 0, a[1] + a[3], false]);
	g.fillRoundedRectangle(r, 4);

	g.setColour(hot ? CYAN : 0xFF1E3A40);
	g.drawRoundedRectangle(r, 4, 1);

	// cyan accent on the left edge
	g.setColour(hot ? CYAN : Colours.withAlpha(CYAN, 0.55));
	g.fillRoundedRectangle([a[0] + 3, a[1] + 6, 2, a[3] - 12], 1);

	g.setFont("Oxygen Bold", 12);
	g.setColour(obj.enabled ? (hot ? 0xFFFFFFFF : TEXT) : TEXT_DIM);
	g.drawAlignedText(obj.text, [a[0] + 12, a[1], a[2] - 40, a[3]], "left");

	// divider + chevron
	g.setColour(0xFF1E3A40);
	g.fillRect([a[0] + a[2] - 26, a[1] + 6, 1, a[3] - 12]);

	var ch = Content.createPath();
	ch.startNewSubPath(0.0, 0.0);
	ch.lineTo(0.5, 0.6);
	ch.lineTo(1.0, 0.0);
	g.setColour(hot ? CYAN : Colours.withAlpha(CYAN, 0.8));
	g.drawPath(ch, [a[0] + a[2] - 18, a[1] + a[3] / 2 - 2, 9, 5], 1.6);
};

const var drawPopupBgFn = function(g, obj)
{
	g.setColour(0xFF05090A);
	g.fillRect([0, 0, obj.width, obj.height]);
	g.setColour(0xFF1E3A40);
	g.drawRect([0, 0, obj.width, obj.height], 1);
	g.setColour(CYAN);
	g.fillRect([0, 0, obj.width, 2]);
};

const var drawPopupItemFn = function(g, obj)
{
	var a = obj.area;
	if (obj.isSeparator)
	{
		g.setColour(0xFF1E3A40);
		g.fillRect([a[0] + 10, a[1] + a[3] / 2, a[2] - 20, 1]);
	}
	else
	{
		if (obj.isHighlighted)
		{
			g.setColour(0x2600E5FF);
			g.fillRect([a[0] + 2, a[1], a[2] - 4, a[3]]);
			g.setColour(CYAN);
			g.fillRect([a[0] + 2, a[1] + 4, 2, a[3] - 8]);
		}

		g.setFont("Oxygen Bold", 12);
		if (obj.isTicked) g.setColour(CYAN);
		else g.setColour(obj.isHighlighted ? 0xFFFFFFFF : TEXT);
		g.drawAlignedText(obj.text, [a[0] + 16, a[1], a[2] - 40, a[3]], "left");

		if (obj.isTicked)
		{
			g.setColour(Colours.withAlpha(CYAN, 0.3));
			g.fillEllipse([a[0] + a[2] - 24, a[1] + a[3] / 2 - 6, 12, 12]);
			g.setColour(CYAN);
			g.fillEllipse([a[0] + a[2] - 21, a[1] + a[3] / 2 - 3, 6, 6]);
		}
	}
};

const var popupItemSizeFn = function(obj)
{
	if (obj.isSeparator) return 9;
	return 26;
};

comboLaf.registerFunction("drawComboBox", drawComboFn);
comboLaf.registerFunction("drawPopupMenuBackground", drawPopupBgFn);
comboLaf.registerFunction("drawPopupMenuItem", drawPopupItemFn);
comboLaf.registerFunction("getIdealPopupMenuItemSize", popupItemSizeFn);

// same popup style for any other menus (preset browser etc.)
laf.registerFunction("drawPopupMenuBackground", drawPopupBgFn);
laf.registerFunction("drawPopupMenuItem", drawPopupItemFn);
laf.registerFunction("getIdealPopupMenuItemSize", popupItemSizeFn);

// EQ display
laf.registerFunction("drawFilterBackground", function(g, obj)
{
	g.setColour(0xFF030607);
	g.fillRoundedRectangle(obj.area, 4);
	g.setColour(EDGE);
	g.drawRoundedRectangle([obj.area[0] + 0.5, obj.area[1] + 0.5, obj.area[2] - 1, obj.area[3] - 1], 4, 1);
});

laf.registerFunction("drawFilterGridLines", function(g, obj)
{
	g.setColour(0x1C00E5FF);
	g.drawPath(obj.grid, obj.area, 1);
});

laf.registerFunction("drawFilterPath", function(g, obj)
{
	g.setColour(0x2600E5FF);
	g.fillPath(obj.path, obj.pathArea);
	g.setColour(Colours.withAlpha(CYAN, 0.25));
	g.drawPath(obj.path, obj.pathArea, 6);
	g.setColour(CYAN);
	g.drawPath(obj.path, obj.pathArea, 2);
});

laf.registerFunction("drawFilterDragHandle", function(g, obj)
{
	var h = obj.handle;
	var sel = obj.index == eqState.band;
	var cx = h[0] + h[2] / 2;
	var cy = h[1] + h[3] / 2;
	var r = 9;

	if (sel || obj.hover || obj.drag)
	{
		g.setColour(Colours.withAlpha(CYAN, 0.25));
		g.fillEllipse([cx - r - 6, cy - r - 6, (r + 6) * 2, (r + 6) * 2]);
	}

	g.setColour(sel ? CYAN : (obj.enabled ? 0xFF0A1A1D : 0xFF060A0B));
	g.fillEllipse([cx - r, cy - r, r * 2, r * 2]);
	g.setColour(obj.enabled ? CYAN : 0xFF2A4A50);
	g.drawEllipse([cx - r, cy - r, r * 2, r * 2], 1.5);

	g.setFont("Oxygen Bold", 11);
	g.setColour(sel ? 0xFF000000 : (obj.enabled ? TEXT : TEXT_DIM));
	g.drawAlignedText("" + (obj.index + 1), [cx - r, cy - r, r * 2, r * 2], "centred");
});

// ---------------------------------------------------------------------
// 4. COMPONENT HELPERS
// ---------------------------------------------------------------------
inline function makePanel(name, parent, x, y, w, h)
{
	local p = Content.addPanel(name, x, y);
	if (parent != "") p.set("parentComponent", parent);
	p.set("x", x);
	p.set("y", y);
	p.set("width", w);
	p.set("height", h);
	p.set("saveInPreset", false);
	p.set("bgColour", 0x00000000);
	p.set("itemColour", 0x00000000);
	p.set("itemColour2", 0x00000000);
	p.set("borderSize", 0);
	return p;
}

inline function makeKnob(name, parent, x, y, label, min, max, mid, step, def)
{
	local k = Content.addKnob(name, x, y);
	k.set("parentComponent", parent);
	k.set("x", x);
	k.set("y", y);
	k.set("width", 66);
	k.set("height", 80);
	k.set("text", label);
	k.set("min", min);
	k.set("max", max);
	k.set("stepSize", step);
	if (mid > min && mid < max) k.set("middlePosition", mid);
	k.set("defaultValue", def);
	k.set("saveInPreset", true);
	k.setValue(def);
	allControls.push(k);
	return k;
}

inline function makeBigKnob(name, parent, x, y, w, label, min, max, mid, step, def)
{
	local k = makeKnob(name, parent, x, y, label, min, max, mid, step, def);
	k.set("width", w);
	k.set("height", 98);
	return k;
}

inline function makeViz(name, parent, x, y, w, h, kind)
{
	local v = makePanel(name, parent, x, y, w, h);
	v.data.kind = kind;
	return v;
}

inline function makeButton(name, parent, x, y, w, h, label, def, save)
{
	local b = Content.addButton(name, x, y);
	b.set("parentComponent", parent);
	b.set("x", x);
	b.set("y", y);
	b.set("width", w);
	b.set("height", h);
	b.set("text", label);
	b.set("saveInPreset", save);
	b.set("defaultValue", def);
	b.setValue(def);
	if (save) allControls.push(b);
	return b;
}

inline function makeCombo(name, parent, x, y, w, items, def)
{
	local c = Content.addComboBox(name, x, y);
	c.set("parentComponent", parent);
	c.set("x", x);
	c.set("y", y);
	c.set("width", w);
	c.set("height", 28);
	c.set("items", items.join("\n"));
	c.setLocalLookAndFeel(comboLaf);
	c.set("saveInPreset", true);
	c.set("defaultValue", def);
	c.setValue(def);
	allControls.push(c);
	return c;
}

inline function makeCaption(name, parent, x, y, w, text)
{
	local l = Content.addLabel(name, x, y);
	l.set("parentComponent", parent);
	l.set("x", x);
	l.set("y", y);
	l.set("width", w);
	l.set("height", 18);
	l.set("text", text);
	l.set("fontName", "Oxygen Bold");
	l.set("fontSize", 11);
	l.set("textColour", TEXT_DIM);
	l.set("bgColour", 0x00000000);
	l.set("alignment", "left");
	l.set("editable", false);
	l.set("saveInPreset", false);
	return l;
}

// ---------------------------------------------------------------------
// 5. LAYOUT
// ---------------------------------------------------------------------
const var pnlBg = makePanel("pnlBg", "", 0, 0, 1000, 680);

// header: tabs
const var btnTabMain = makeButton("btnTabMain", "", 300, 14, 86, 40, "MAIN",    1, false);
const var btnTabFX   = makeButton("btnTabFX",   "", 389, 14, 86, 40, "EFFECTS", 0, false);
const var btnTabEQ   = makeButton("btnTabEQ",   "", 478, 14, 86, 40, "EQ",      0, false);
const var btnTabArp  = makeButton("btnTabArp",  "", 567, 14, 86, 40, "ARP",     0, false);
const var btnTabXY   = makeButton("btnTabXY",   "", 656, 14, 86, 40, "XY PAD",  0, false);
const var tabs = [btnTabMain, btnTabFX, btnTabEQ, btnTabArp, btnTabXY];
// tabs moved left to make room: keep their positions in sync on recompile
for (i = 0; i < tabs.length; i++) { tabs[i].set("x", 300 + i * 89); tabs[i].set("width", 86); }

// header: presets
const var btnPrev = makeButton("btnPrev", "", 770, 20, 26, 28, "<", 0, false);
const var pnlPresetName = makePanel("pnlPresetName", "", 798, 20, 154, 28);
const var btnNext = makeButton("btnNext", "", 954, 20, 26, 28, ">", 0, false);

for (t in tabs) t.setLocalLookAndFeel(tabLaf);
btnPrev.setLocalLookAndFeel(tabLaf);
btnNext.setLocalLookAndFeel(tabLaf);
btnPrev.set("isMomentary", true);
btnNext.set("isMomentary", true);

// pages
const var pnlMain = makePanel("pnlMain", "", 0, 72, 1000, 568);
const var pnlFX   = makePanel("pnlFX",   "", 0, 72, 1000, 568);
const var pnlArp  = makePanel("pnlArp",  "", 0, 72, 1000, 568);
const var pnlXYPage = makePanel("pnlXYPage", "", 0, 72, 1000, 568);
const var pnlEQ   = makePanel("pnlEQ",   "", 0, 72, 1000, 568);
const var pages = [pnlMain, pnlFX, pnlEQ, pnlArp, pnlXYPage];

// ---- MAIN ----
pnlMain.data.boxes = [[20, 10, 300, 178, "SUB OSC", "SINE FUNDAMENTAL"],
                      [20, 198, 300, 178, "HARMONICS", "2ND + 3RD PARTIAL"],
                      [20, 386, 300, 172, "GRIT LAYER", "UPPER BITE"],
                      [340, 420, 320, 138, "LOW END", "PUNCH + SUB OCTAVE"],
                      [680, 10, 300, 300, "AMP ENVELOPE", "ADSR"],
                      [680, 320, 300, 238, "MASTER", "OUTPUT + VOICING"]];

const var SubLevel = makeBigKnob("SubLevel", "pnlMain", 32,  44, 78, "LEVEL",  0, 1, -1, 0.01, 0.85);
const var SubOct   = makeBigKnob("SubOct",   "pnlMain", 121, 44, 78, "OCTAVE", -2, 1, -1, 1, 0);
const var SubDrive = makeBigKnob("SubDrive", "pnlMain", 210, 44, 78, "WARMTH", 0, 1, -1, 0.01, 0.15);
const var vizSubWave = makeViz("vizSubWave", "pnlMain", 34, 146, 272, 36, "subwave");

const var Harm2 = makeBigKnob("Harm2", "pnlMain", 32,  236, 78, "2ND",   0, 1, -1, 0.01, 0.30);
const var Harm3 = makeBigKnob("Harm3", "pnlMain", 112, 236, 78, "3RD",   0, 1, -1, 0.01, 0.12);
const var vizHarm = makeViz("vizHarm", "pnlMain", 198, 236, 108, 130, "harm");

const var GritLevel = makeBigKnob("GritLevel", "pnlMain", 32,  424, 78, "LEVEL",  0, 1, -1, 0.01, 0.08);
const var GritOct   = makeBigKnob("GritOct",   "pnlMain", 112, 424, 78, "OCTAVE", -1, 2, -1, 1, 0);
const var capGritWave = makeCaption("capGritWave", "pnlMain", 200, 422, 106, "WAVE");
const var GritWave  = makeCombo("GritWave", "pnlMain", 200, 442, 106, WAVE_NAMES, 1);
const var vizGritWave = makeViz("vizGritWave", "pnlMain", 200, 478, 106, 70, "gritwave");

const var pnlWoofer = makePanel("pnlWoofer", "pnlMain", 340, 0, 320, 410);

const var PunchAmt  = makeBigKnob("PunchAmt",  "pnlMain", 352, 456, 76, "PUNCH", 0, 12, 3, 0.1, 0);
const var PunchTime = makeBigKnob("PunchTime", "pnlMain", 430, 456, 76, "P.DECAY", 10, 500, 80, 1, 60);
const var DeepLevel = makeBigKnob("DeepLevel", "pnlMain", 508, 456, 76, "DEEP", 0, 1, -1, 0.01, 0);
const var vizLow = makeViz("vizLow", "pnlMain", 592, 458, 56, 92, "lowmeter");

const var pnlEnv  = makePanel("pnlEnv", "pnlMain", 694, 48, 272, 140);
const var Attack  = makeBigKnob("Attack",  "pnlMain", 690, 200, 70, "ATTACK",  1, 2000, 100, 1, 3);
const var Decay   = makeBigKnob("Decay",   "pnlMain", 762, 200, 70, "DECAY",   5, 5000, 400, 1, 450);
const var Sustain = makeBigKnob("Sustain", "pnlMain", 834, 200, 70, "SUSTAIN", 0, 100, -1, 1, 85);
const var Release = makeBigKnob("Release", "pnlMain", 906, 200, 70, "RELEASE", 5, 5000, 400, 1, 180);

const var Volume   = makeBigKnob("Volume",   "pnlMain", 694, 362, 80, "VOLUME",   -24, 6, -1, 0.1, -3);
const var VelSens  = makeBigKnob("VelSens",  "pnlMain", 780, 362, 80, "VELOCITY", 0, 1, -1, 0.01, 0.3);
const var MonoBtn  = makeButton("MonoBtn", "pnlMain", 696, 478, 164, 30, "MONO", 1, true);
const var vizVoice = makeViz("vizVoice", "pnlMain", 696, 516, 164, 32, "voice");
const var vizMeter = makeViz("vizMeter", "pnlMain", 872, 362, 94, 186, "meter");

// ---- EFFECTS ----
pnlFX.data.boxes = [[20, 10, 306, 176, "FILTER", "PER-VOICE"],      [347, 10, 306, 176, "POLYSHAPE", "WAVESHAPER"],  [674, 10, 306, 176, "SATURATOR", "WARM DRIVE"],
                    [20, 196, 306, 176, "COMPRESSOR", "GLUE"],      [347, 196, 306, 176, "LIMITER", "CEILING"],       [674, 196, 306, 176, "CHORUS", "MOTION"],
                    [20, 382, 306, 176, "DELAY", "ECHO"],           [347, 382, 306, 176, "REVERB", "SPACE"],          [674, 382, 306, 176, "STEREO", "WIDTH"]];

// filter
const var FilterOn   = makeButton("FilterOn", "pnlFX", 242, 17, 64, 22, "ON", 1, true);
const var Cutoff     = makeBigKnob("Cutoff",    "pnlFX", 30,  48, 78, "CUTOFF", 20, 20000, 1000, 1, 2500);
const var Resonance  = makeBigKnob("Resonance", "pnlFX", 108, 48, 78, "RESO",   0.3, 9.9, -1, 0.01, 1.0);
const var vizFilter  = makeViz("vizFilter", "pnlFX", 194, 48, 120, 68, "filter");
const var capFilterMode = makeCaption("capFilterMode", "pnlFX", 194, 122, 120, "MODE");
const var FilterMode = makeCombo("FilterMode", "pnlFX", 194, 140, 120, FILTER_NAMES, 1);

// polyshape
const var ShapeOn    = makeButton("ShapeOn", "pnlFX", 569, 17, 64, 22, "ON", 1, true);
const var ShapeDrive = makeBigKnob("ShapeDrive", "pnlFX", 357, 48, 78, "DRIVE", 0, 24, -1, 0.1, 3);
const var capShapeMode = makeCaption("capShapeMode", "pnlFX", 443, 44, 198, "SHAPE");
const var ShapeMode  = makeCombo("ShapeMode", "pnlFX", 443, 62, 198, SHAPE_NAMES, 2);
const var vizShape   = makeViz("vizShape", "pnlFX", 443, 98, 198, 76, "shape");

// saturator
const var SatOn      = makeButton("SatOn", "pnlFX", 896, 17, 64, 22, "ON", 1, true);
const var SatAmount  = makeBigKnob("SatAmount", "pnlFX", 684, 48, 78, "AMOUNT", 0, 0.95, -1, 0.01, 0.3);
const var SatMix     = makeBigKnob("SatMix",    "pnlFX", 762, 48, 78, "MIX",    0, 1, -1, 0.01, 0.5);
const var vizSat     = makeViz("vizSat", "pnlFX", 848, 48, 120, 128, "sat");

// compressor
const var CompOn      = makeButton("CompOn", "pnlFX", 242, 203, 64, 22, "ON", 1, true);
const var CompThresh  = makeBigKnob("CompThresh",  "pnlFX", 28,  232, 70, "THRESH",  -40, 0, -1, 0.1, -12);
const var CompRatio   = makeBigKnob("CompRatio",   "pnlFX", 98,  232, 70, "RATIO",   1, 20, 4, 0.1, 4);
const var CompAttack  = makeBigKnob("CompAttack",  "pnlFX", 168, 232, 70, "ATTACK",  0.1, 100, 10, 0.1, 10);
const var CompRelease = makeBigKnob("CompRelease", "pnlFX", 238, 232, 70, "RELEASE", 10, 1000, 150, 1, 120);
const var vizComp     = makeViz("vizComp", "pnlFX", 32, 336, 282, 28, "comp");

// limiter
const var LimOn      = makeButton("LimOn", "pnlFX", 569, 203, 64, 22, "ON", 1, true);
const var LimCeiling = makeBigKnob("LimCeiling", "pnlFX", 357, 234, 78, "CEILING", -24, 0, -1, 0.1, -1);
const var LimRelease = makeBigKnob("LimRelease", "pnlFX", 435, 234, 78, "RELEASE", 10, 500, 80, 1, 60);
const var vizLim     = makeViz("vizLim", "pnlFX", 521, 234, 120, 128, "lim");

// chorus
const var ChorusOn    = makeButton("ChorusOn", "pnlFX", 896, 203, 64, 22, "ON", 0, true);
const var ChorusRate  = makeBigKnob("ChorusRate",  "pnlFX", 684, 234, 78, "RATE",  0, 1, -1, 0.01, 0.3);
const var ChorusDepth = makeBigKnob("ChorusDepth", "pnlFX", 762, 234, 78, "DEPTH", 0, 1, -1, 0.01, 0.4);
const var vizChorus   = makeViz("vizChorus", "pnlFX", 848, 234, 120, 128, "chorus");

// delay
const var DelayOn       = makeButton("DelayOn", "pnlFX", 242, 389, 64, 22, "ON", 0, true);
const var DelayTime     = makeBigKnob("DelayTime",     "pnlFX", 30,  418, 78, "TIME",     10, 1000, 250, 1, 375);
const var DelayFeedback = makeBigKnob("DelayFeedback", "pnlFX", 120, 418, 78, "FEEDBACK", 0, 0.95, -1, 0.01, 0.3);
const var DelayMix      = makeBigKnob("DelayMix",      "pnlFX", 210, 418, 78, "MIX",      0, 1, -1, 0.01, 0.2);
const var vizDelay      = makeViz("vizDelay", "pnlFX", 32, 520, 282, 30, "delay");

// reverb
const var ReverbOn   = makeButton("ReverbOn", "pnlFX", 569, 389, 64, 22, "ON", 0, true);
const var ReverbSize = makeBigKnob("ReverbSize", "pnlFX", 357, 420, 78, "SIZE", 0, 1, -1, 0.01, 0.5);
const var ReverbMix  = makeBigKnob("ReverbMix",  "pnlFX", 435, 420, 78, "MIX",  0, 1, -1, 0.01, 0.15);
const var vizReverb  = makeViz("vizReverb", "pnlFX", 521, 420, 120, 128, "reverb");

// stereo
const var Width = makeBigKnob("Width", "pnlFX", 684, 420, 78, "WIDTH", 0, 200, -1, 1, 100);
const var vizStereo = makeViz("vizStereo", "pnlFX", 770, 420, 198, 128, "stereo");

const var mainViz = [vizSubWave, vizHarm, vizGritWave, vizLow, vizVoice, vizMeter];
const var fxViz = [vizFilter, vizShape, vizSat, vizComp, vizLim, vizChorus, vizDelay, vizReverb, vizStereo];

// ---- ARP ----
pnlArp.data.boxes = [[20, 10, 960, 150, "ARPEGGIATOR"], [20, 168, 960, 390, "STEP SEQUENCER"]];

const var ArpOn    = makeButton("ArpOn",    "pnlArp", 40, 52, 110, 30, "ARP ON", 0, true);
const var ArpLatch = makeButton("ArpLatch", "pnlArp", 40, 100, 110, 30, "LATCH", 0, true);

const var capArpRate = makeCaption("capArpRate", "pnlArp", 172, 40, 120, "RATE");
const var ArpRate  = makeCombo("ArpRate", "pnlArp", 172, 60, 120, RATE_NAMES, 7);
const var capArpMode = makeCaption("capArpMode", "pnlArp", 172, 96, 120, "MODE");
const var ArpMode  = makeCombo("ArpMode", "pnlArp", 172, 116, 120, ARP_MODES, 1);
const var capArpVelMode = makeCaption("capArpVelMode", "pnlArp", 310, 40, 140, "VELOCITY");
const var ArpVelMode = makeCombo("ArpVelMode", "pnlArp", 310, 60, 140, VEL_MODES, 1);

const var ArpOct   = makeKnob("ArpOct",   "pnlArp", 470, 44, "OCTAVES",   1, 4, -1, 1, 1);
const var ArpGate  = makeKnob("ArpGate",  "pnlArp", 545, 44, "GATE",      0.05, 1, -1, 0.01, 0.8);
const var ArpSwing = makeKnob("ArpSwing", "pnlArp", 620, 44, "SWING",     0, 0.5, -1, 0.01, 0);
const var ArpSteps = makeKnob("ArpSteps", "pnlArp", 695, 44, "STEPS",     1, 16, -1, 1, 16);
const var ArpTranspose = makeKnob("ArpTranspose", "pnlArp", 770, 44, "TRANSPOSE", -24, 24, -1, 1, 0);

const var ArpRandom = makeButton("ArpRandom", "pnlArp", 860, 56, 100, 28, "RANDOMIZE", 0, false);
const var ArpReset  = makeButton("ArpReset",  "pnlArp", 860, 96, 100, 28, "RESET", 0, false);
ArpRandom.set("isMomentary", true);
ArpReset.set("isMomentary", true);

// step sequencer lanes: muted bars, step grid, cyan step flash
const var packLaf = Content.createLocalLookAndFeel();

packLaf.registerFunction("drawSliderPackBackground", function(g, obj)
{
	var a = obj.area;
	var n = obj.numSliders;
	var cw = a[2] / n;
	g.setColour(0xFF04080A);
	g.fillRoundedRectangle(a, 3);
	g.setColour(0x0A00E5FF);
	for (i = 0; i < n; i += 8)
		g.fillRect([a[0] + i * cw, a[1], cw * 4, a[3]]);
	g.setColour(0xFF0E1C20);
	for (i = 1; i < n; i++)
		g.fillRect([a[0] + i * cw, a[1] + 2, 1, a[3] - 4]);
	if (obj.id == "ArpPitch")
	{
		g.setColour(0x3000E5FF);
		g.fillRect([a[0], a[1] + a[3] / 2, a[2], 1]);
	}
	// steps beyond the step count are greyed out
	var steps = ArpSteps.getValue();
	if (steps < n)
	{
		g.setColour(0xA0000000);
		g.fillRect([a[0] + steps * cw, a[1], a[2] - steps * cw, a[3]]);
	}
	g.setColour(0xFF12313A);
	g.drawRoundedRectangle([a[0] + 0.5, a[1] + 0.5, a[2] - 1, a[3] - 1], 3, 1);
});

packLaf.registerFunction("drawLinearSlider", function(g, obj)
{
	var a = obj.area;
	var range = obj.max - obj.min;
	var norm = range > 0 ? (obj.value - obj.min) / range : 0;
	var bipolar = obj.min < 0 && obj.max > 0;
	var x = a[0] + 3;
	var w = a[2] - 6;
	var top = 0.0;
	var bot = 0.0;

	if (bipolar)
	{
		var mid = a[1] + a[3] * 0.5;
		var yv = a[1] + a[3] * (1.0 - norm);
		top = Math.min(mid, yv);
		bot = Math.max(mid, yv);
	}
	else
	{
		top = a[1] + a[3] * (1.0 - norm);
		bot = a[1] + a[3];
	}

	if (bot - top > 0.5)
	{
		g.setGradientFill([0xFF0C5560, 0, top, 0xFF06262B, 0, bot, false]);
		g.fillRect([x, top, w, bot - top]);
		g.setColour(Colours.withAlpha(CYAN, 0.55));
		g.fillRect([x, bipolar && obj.value < 0 ? bot - 2 : top, w, 2]);
	}
	else if (!bipolar)
	{
		// rest step
		g.setColour(0xFF1A3036);
		g.fillEllipse([x + w / 2 - 2, a[1] + a[3] - 8, 4, 4]);
	}
});

packLaf.registerFunction("drawSliderPackFlashOverlay", function(g, obj)
{
	var a = obj.area;
	var k = obj.intensity;
	g.setColour(Colours.withAlpha(CYAN, 0.10 * k));
	g.fillRect([a[0] - 2, 0, a[2] + 4, 2000]);
	g.setColour(Colours.withAlpha(CYAN, 0.55 * k));
	g.fillRect(a);
	g.setColour(Colours.withAlpha(0xFFFFFFFF, 0.8 * k));
	g.fillRect([a[0], a[1], a[2], 2]);
});

inline function makeLane(name, y, h, min, max, step)
{
	local sp = Content.addSliderPack(name, 120, y);
	sp.set("parentComponent", "pnlArp");
	sp.set("x", 120);
	sp.set("y", y);
	sp.set("width", 840);
	sp.set("height", h);
	sp.set("sliderAmount", 16);
	sp.set("min", min);
	sp.set("max", max);
	sp.set("stepSize", step);
	sp.set("bgColour", 0xFF04080A);
	sp.set("itemColour", 0xFF0C5560);
	sp.set("itemColour2", 0x2000E5FF);
	sp.set("textColour", TEXT);
	sp.set("showValueOverlay", true);
	sp.set("flashActive", true);
	sp.setLocalLookAndFeel(packLaf);
	sp.set("saveInPreset", true);
	return sp;
}

const var pnlStepView = makePanel("pnlStepView", "pnlArp", 120, 204, 840, 10);
const var capLaneVel   = makeCaption("capLaneVel",   "pnlArp", 40, 222, 76, "VELOCITY");
const var ArpVel   = makeLane("ArpVel",   220, 120, 0, 1, 0.01);
const var capLanePitch = makeCaption("capLanePitch", "pnlArp", 40, 352, 76, "PITCH");
const var capLanePitch2 = makeCaption("capLanePitch2", "pnlArp", 40, 368, 76, "+/- 12 st");
const var ArpPitch = makeLane("ArpPitch", 350, 100, -12, 12, 1);
const var capLaneGate  = makeCaption("capLaneGate",  "pnlArp", 40, 462, 76, "GATE");
const var ArpGateLane = makeLane("ArpGateLane", 460, 86, 0.05, 1, 0.01);

// ---- XY PAD ----
pnlXYPage.data.boxes = [[588, 10, 392, 548, "XY CONTROL"]];

const var pnlXY  = makePanel("pnlXY", "pnlXYPage", 20, 10, 548, 548);
pnlXY.set("allowCallbacks", "Clicks, Hover & Dragging");

const var XYOn    = makeButton("XYOn",    "pnlXYPage", 608, 50, 110, 30, "XY ACTIVE", 1, true);
const var XYReset = makeButton("XYReset", "pnlXYPage", 730, 50, 110, 30, "CENTRE", 0, false);
XYReset.set("isMomentary", true);

const var capX    = makeCaption("capX", "pnlXYPage", 608, 112, 200, "X AXIS  (left  >  right)");
const var XTarget = makeCombo("XTarget", "pnlXYPage", 608, 134, 200, TARGET_NAMES, 1);
const var XDepth  = makeKnob("XDepth", "pnlXYPage", 840, 108, "X DEPTH", 0, 1, -1, 0.01, 0.6);

const var capY    = makeCaption("capY", "pnlXYPage", 608, 212, 200, "Y AXIS  (bottom  >  top)");
const var YTarget = makeCombo("YTarget", "pnlXYPage", 608, 234, 200, TARGET_NAMES, 3);
const var YDepth  = makeKnob("YDepth", "pnlXYPage", 840, 208, "Y DEPTH", 0, 1, -1, 0.01, 0.6);

const var XPos = makeKnob("XPos", "pnlXYPage", 608, 470, "X", 0, 1, -1, 0.001, 0.5);
const var YPos = makeKnob("YPos", "pnlXYPage", 680, 470, "Y", 0, 1, -1, 0.001, 0.3);
XPos.set("visible", false);
YPos.set("visible", false);

const var pnlXYInfo = makePanel("pnlXYInfo", "pnlXYPage", 608, 310, 352, 230);

// ---- EQ ----
pnlEQ.data.boxes = [[20, 10, 960, 380, "EQUALIZER", "PARAMETRIC"], [20, 400, 960, 158, "SELECTED BAND", "GAIN + FREQ + Q + TYPE"]];

const var EqOn = makeButton("EqOn", "pnlEQ", 884, 17, 70, 22, "ON", 1, false);

const var ftEQ = Content.addFloatingTile("ftEQ", 40, 44);
ftEQ.set("parentComponent", "pnlEQ");
ftEQ.set("x", 40);
ftEQ.set("y", 44);
ftEQ.set("width", 920);
ftEQ.set("height", 330);
ftEQ.setContentData({
	"Type": "DraggableFilterPanel",
	"ProcessorId": EQ_ID,
	"Index": -1,
	"FollowWorkspace": false,
	"AllowFilterResizing": true,
	"AllowContextMenu": true,
	"ResetOnDoubleClick": false,
	"ShowLines": true,
	"GainRange": 24.0,
	"ColourData": {"bgColour": "0xFF030607", "itemColour1": "0xFF00E5FF", "itemColour2": "0x2200E5FF",
	               "itemColour3": "0x1A00E5FF", "textColour": "0xFFCFF7FC"}
});

const var capEqBands = makeCaption("capEqBands", "pnlEQ", 40, 446, 200, "BAND");
const var eqBandBtns = [];
for (i = 0; i < EQ_MAX_BANDS; i++)
{
	eqBandBtns.push(makeButton("EqBand" + (i + 1), "pnlEQ", 40 + i * 41, 468, 37, 30, "" + (i + 1), i == 0 ? 1 : 0, false));
	eqBandBtns[i].setLocalLookAndFeel(tabLaf);
}

const var EqGain = makeBigKnob("EqGain", "pnlEQ", 392, 446, 78, "GAIN", -18, 18, -1, 0.1, 0);
const var EqFreq = makeBigKnob("EqFreq", "pnlEQ", 474, 446, 78, "FREQ", 20, 20000, 1000, 1, 1000);
const var EqQ    = makeBigKnob("EqQ",    "pnlEQ", 556, 446, 78, "Q",    0.3, 8, 1.0, 0.01, 1.0);
const var capEqType = makeCaption("capEqType", "pnlEQ", 650, 446, 140, "TYPE");
const var EqType = makeCombo("EqType", "pnlEQ", 650, 468, 140, EQ_TYPES, 5);
const var EqBandOn = makeButton("EqBandOn", "pnlEQ", 802, 468, 80, 30, "BAND ON", 1, false);
const var EqReset  = makeButton("EqReset",  "pnlEQ", 890, 468, 80, 30, "RESET", 0, false);
EqReset.set("isMomentary", true);

// these mirror the EQ module (stored as a module state), not plain preset values
for (c in [EqGain, EqFreq, EqQ, EqType])
{
	c.set("saveInPreset", false);
	allControls.remove(c);
}

// ---- preset browser overlay ----
const var pnlBrowser = makePanel("pnlBrowser", "", 0, 64, 1000, 584);
const var ftPresets = Content.addFloatingTile("ftPresets", 20, 20);
ftPresets.set("parentComponent", "pnlBrowser");
ftPresets.set("x", 20);
ftPresets.set("y", 20);
ftPresets.set("width", 960);
ftPresets.set("height", 520);
ftPresets.setContentData({
	"Type": "PresetBrowser",
	"Title": " ",
	"Font": "Oxygen Bold",
	"FontSize": 15,
	"ColourData": {"textColour": "0xFF00E5FF", "bgColour": "0x00000000",
	               "itemColour1": "0xFF00E5FF", "itemColour2": "0x2200E5FF"},
	"ShowSaveButton": true,
	"ShowExpansionsAsColumn": false,
	"ShowFolderButton": true,
	"ShowNotes": false,
	"ShowEditButtons": true,
	"ShowFavoriteIcon": true,
	"NumColumns": 3,
	"ColumnWidthRatio": [0.25, 0.25, 0.5]
});
const var btnCloseBrowser = makeButton("btnCloseBrowser", "pnlBrowser", 880, 548, 100, 28, "CLOSE", 0, false);
btnCloseBrowser.set("isMomentary", true);
pnlBrowser.set("visible", false);

// footer
const var lblReadout = Content.addLabel("lblReadout", 20, 652);
lblReadout.set("width", 600);
lblReadout.set("height", 22);
lblReadout.set("fontName", "Oxygen Bold");
lblReadout.set("fontSize", 13);
lblReadout.set("textColour", CYAN);
lblReadout.set("alignment", "left");
lblReadout.set("editable", false);
lblReadout.set("saveInPreset", false);
lblReadout.set("text", "KNUCKLEBASS READY");

// ---------------------------------------------------------------------
// 6. ENGINE LOGIC
// ---------------------------------------------------------------------
inline function fmt(v, d)
{
	// String(x, 0) in JUCE means "full precision", so round integers ourselves
	local t = Engine.doubleToString(v, d);
	if (d == 0) t = "" + parseInt(Math.round(v));
	return t;
}
inline function fmtHz(v) { local s = fmt(v, 0) + " Hz"; if (v >= 1000) s = fmt(v / 1000, 2) + " kHz"; return s; }
inline function fmtMs(v) { local s = fmt(v, 0) + " ms"; if (v >= 1000) s = fmt(v / 1000, 2) + " s"; return s; }
inline function pct(v)   { return fmt(v * 100, 0) + " %"; }
inline function show(name, text) { lblReadout.set("text", name + "   " + text); }

inline function normLog(v, lo, hi)   { return Math.log(v / lo) / Math.log(hi / lo); }
inline function denormLog(n, lo, hi) { return lo * Math.pow(hi / lo, n); }

// XY contribution for a target (cutoff is bipolar around the pad centre, the rest add upwards)
inline function axisAmount(pos, depth, t)
{
	local a = pos * depth;
	if (t == T_CUTOFF) a = (pos - 0.5) * 2.0 * depth;
	return a;
}

inline function xyOffset(t)
{
	local o = 0.0;
	if (XYOn.getValue())
	{
		if (XTarget.getValue() - 1 == t) o = o + axisAmount(XPos.getValue(), XDepth.getValue(), t);
		if (YTarget.getValue() - 1 == t) o = o + axisAmount(YPos.getValue(), YDepth.getValue(), t);
	}
	return o;
}

inline function xyHas(t)
{
	local r = 0;
	if (XYOn.getValue())
	{
		if (XTarget.getValue() - 1 == t && XDepth.getValue() > 0) r = 1;
		if (YTarget.getValue() - 1 == t && YDepth.getValue() > 0) r = 1;
	}
	return r;
}

inline function applyTarget(t)
{
	local o = xyOffset(t);
	local n = 0.0;

	if (t == T_CUTOFF || t == T_RES)
	{
		local freq = denormLog(Math.range(normLog(Cutoff.getValue(), 20, 20000) + xyOffset(T_CUTOFF), 0, 1), 20, 20000);
		local q = 0.3 + Math.range((Resonance.getValue() - 0.3) / 9.6 + xyOffset(T_RES), 0, 1) * 9.6;
		local fOff = FilterOn.getValue() == 0 && xyHas(T_CUTOFF) == 0 && xyHas(T_RES) == 0;
		for (f in filters)
		{
			f.setAttribute(f.Frequency, freq);
			f.setAttribute(f.Q, q);
			f.setBypassed(fOff);
		}
	}
	else if (t == T_DRIVE)
	{
		n = Math.range(ShapeDrive.getValue() / 24.0 + o, 0, 1);
		SubShape.setAttribute(SubShape.Drive, n * 24.0);
		GritShape.setAttribute(GritShape.Drive, n * 24.0);
		SubShape.setBypassed(ShapeOn.getValue() == 0 && xyHas(T_DRIVE) == 0);
		GritShape.setBypassed(ShapeOn.getValue() == 0 && xyHas(T_DRIVE) == 0);
	}
	else if (t == T_SAT)
	{
		for (sa in sats)
		{
			sa.setAttribute(sa.Saturation, Math.range(SatAmount.getValue() + o, 0, 0.95));
			sa.setBypassed(SatOn.getValue() == 0 && xyHas(T_SAT) == 0);
		}
	}
	else if (t == T_HARM)
	{
		Harm2Osc.setAttribute(Harm2Osc.Gain, Math.range(Harm2.getValue() + o, 0, 1));
		Harm3Osc.setAttribute(Harm3Osc.Gain, Math.range(Harm3.getValue() + o * 0.6, 0, 1));
	}
	else if (t == T_GRIT)
	{
		GritOsc.setAttribute(GritOsc.Gain, Math.range(GritLevel.getValue() + o * 0.5, 0, 1));
	}
	else if (t == T_DELAY)
	{
		Delay.setAttribute(Delay.Mix, Math.range(DelayMix.getValue() + o, 0, 1));
		Delay.setBypassed(DelayOn.getValue() == 0 && xyHas(T_DELAY) == 0);
	}
	else if (t == T_REVERB)
	{
		Reverb.setAttribute(Reverb.WetLevel, Math.range(ReverbMix.getValue() + o, 0, 1));
		Reverb.setBypassed(ReverbOn.getValue() == 0 && xyHas(T_REVERB) == 0);
	}
	else if (t == T_CHORUS)
	{
		Chorus.setAttribute(Chorus.Width, Math.range(ChorusDepth.getValue() + o, 0, 1));
		Chorus.setBypassed(ChorusOn.getValue() == 0 && xyHas(T_CHORUS) == 0);
	}
}

inline function applyAll()
{
	local t = 0;
	for (t = 0; t < NUM_TARGETS; t++)
		applyTarget(t);
}

inline function applyOctaves()
{
	local o = SubOct.getValue();
	SubOsc.setAttribute(SubOsc.OctaveTranspose, o);
	Harm2Osc.setAttribute(Harm2Osc.OctaveTranspose, o);
	Harm3Osc.setAttribute(Harm3Osc.OctaveTranspose, o);
	GritOsc.setAttribute(GritOsc.OctaveTranspose1, Math.range(o + GritOct.getValue(), -5, 5));
	DeepOsc.setAttribute(DeepOsc.OctaveTranspose, Math.range(o - 1, -5, 5));
}

inline function applyLowEnd()
{
	for (pe in pitchEnvs)
	{
		pe.setIntensity(PunchAmt.getValue());
		pe.setAttribute(pe.Decay, PunchTime.getValue());
	}
	DeepOsc.setAttribute(DeepOsc.Gain, DeepLevel.getValue());
}

inline function applyEnvelope()
{
	local susDb = Engine.getDecibelsForGainFactor(Math.max(Sustain.getValue() / 100.0, 0.00001));
	for (e in envs)
	{
		e.setAttribute(e.Attack,  Attack.getValue());
		e.setAttribute(e.Decay,   Decay.getValue());
		e.setAttribute(e.Sustain, Math.max(susDb, -100));
		e.setAttribute(e.Release, Release.getValue());
	}
	pnlEnv.repaint();
}

// ---------------------------------------------------------------------
// 7. ARPEGGIATOR (runs on the audio thread)
// ---------------------------------------------------------------------
inline function getStepMs()
{
	local bpm = Engine.getHostBpm();
	if (bpm < 20) bpm = 120;
	return 60000.0 / bpm * RATE_QUARTERS[ArpRate.getValue() - 1];
}

inline function buildPattern()
{
	local mode = ArpMode.getValue();      // 1 Up, 2 Down, 3 UpDown, 4 Random, 5 As played, 6 Chord
	local octs = ArpOct.getValue();
	local o = 0;
	local n = 0;
	local i = 0;
	local len = 0;

	pat.clear();

	for (o = 0; o < octs; o++)
	{
		if (mode == 5)
		{
			for (n in order)
				if (n + o * 12 < 128) pat.push(n + o * 12);
		}
		else if (mode == 2)
		{
			for (i = 127; i >= 0; i--)
				if (isHeld[i] && i + (octs - 1 - o) * 12 < 128) pat.push(i + (octs - 1 - o) * 12);
		}
		else
		{
			for (i = 0; i < 128; i++)
				if (isHeld[i] && i + o * 12 < 128) pat.push(i + o * 12);
		}
	}

	if (mode == 3)
	{
		len = pat.length;
		for (i = len - 2; i > 0; i--)
			pat.push(pat[i]);
	}
}

inline function arpPlay(note, vel, offSamples)
{
	local id = 0;
	if (note >= 0 && note < 128)
	{
		id = Synth.playNote(note, vel);
		Synth.noteOffDelayedByEventId(id, offSamples);
	}
}

inline function arpReleaseLatched()
{
	local i = 0;
	for (i = 0; i < 128; i++)
	{
		if (isHeld[i] == 1 && phys[i] == 0)
		{
			isHeld[i] = 0;
			order.remove(i);
		}
	}
}

inline function arpTick()
{
	local numSteps = ArpSteps.getValue();
	local stepIdx = 0;
	local stepMs = getStepMs();
	local note = 0;
	local v = 0;
	local dur = 0.0;
	local offset = 0;
	local offSamples = 0;
	local velMode = ArpVelMode.getValue();
	local k = 0;

	if (arp.latchRelease == 1)
	{
		arp.latchRelease = 0;
		arpReleaseLatched();
	}

	buildPattern();

	if (pat.length == 0)
	{
		Synth.stopTimer();
		arp.running = 0;
		arp.display = -1;
	}
	else
	{
		stepIdx = arp.step % numSteps;

		if (stepVel[stepIdx] > 0.01)
		{
			if (velMode == 1)      v = arp.vel * stepVel[stepIdx];
			else if (velMode == 2) v = 127 * stepVel[stepIdx];
			else                   v = arp.vel;
			v = Math.range(Math.round(v), 1, 127);

			offset = ArpTranspose.getValue() + stepPitch[stepIdx];
			offSamples = Engine.getSamplesForMilliSeconds(Math.max(10, stepMs * ArpGate.getValue() * stepGate[stepIdx]));

			if (ArpMode.getValue() == 6)
			{
				for (k = 0; k < pat.length; k++)
					arpPlay(pat[k] + offset, v, offSamples);
			}
			else
			{
				if (ArpMode.getValue() == 4)
					note = pat[Math.floor(Math.random() * pat.length) % pat.length];
				else
					note = pat[arp.noteIdx % pat.length];

				arpPlay(note + offset, v, offSamples);
			}

			arp.noteIdx = arp.noteIdx + 1;
			vis.hits = vis.hits + 1;
		}

		arp.display = stepIdx;

		if (arp.step % 2 == 0)
			dur = stepMs * (1.0 + ArpSwing.getValue());
		else
			dur = stepMs * (1.0 - ArpSwing.getValue());

		arp.step = arp.step + 1;
		Synth.startTimer(Math.max(0.01, dur / 1000.0));
	}
}

inline function arpNoteOn(n, v)
{
	// latch: the first key after all keys were released starts a new chord
	if (ArpLatch.getValue() && arp.physCount == 0)
	{
		arpReleaseLatched();
	}

	phys[n] = 1;
	arp.physCount = arp.physCount + 1;

	if (isHeld[n] == 0)
	{
		isHeld[n] = 1;
		order.push(n);
	}
	arp.vel = v;

	if (arp.running == 0)
	{
		arp.running = 1;
		arp.step = 0;
		arp.noteIdx = 0;
		arpTick();
	}
}

inline function arpNoteOff(n)
{
	if (phys[n] == 1)
	{
		phys[n] = 0;
		arp.physCount = Math.max(0, arp.physCount - 1);
	}

	if (ArpLatch.getValue() == 0)
	{
		isHeld[n] = 0;
		order.remove(n);
	}

	if (order.length == 0)
	{
		Synth.stopTimer();
		arp.running = 0;
		arp.display = -1;
	}
}

// ---------------------------------------------------------------------
// 8. CONTROL CALLBACKS
// ---------------------------------------------------------------------
inline function onTab(component, value)
{
	local idx = PAGE_NAMES.indexOf(component.get("text"));
	local i = 0;
	for (i = 0; i < tabs.length; i++)
	{
		tabs[i].setValue(i == idx ? 1 : 0);
		pages[i].set("visible", i == idx);
	}
	pnlBrowser.set("visible", false);
}
for (t in tabs) t.setControlCallback(onTab);

inline function onPrev(component, value) { if (value) { Engine.loadPreviousUserPreset(false); pnlPresetName.repaint(); } }
inline function onNext(component, value) { if (value) { Engine.loadNextUserPreset(false); pnlPresetName.repaint(); } }
inline function onCloseBrowser(component, value) { if (value) { pnlBrowser.set("visible", false); pnlPresetName.repaint(); } }
btnPrev.setControlCallback(onPrev);
btnNext.setControlCallback(onNext);
btnCloseBrowser.setControlCallback(onCloseBrowser);

// main
inline function onSubLevel(component, value) { SubOsc.setAttribute(SubOsc.Gain, value); show("SUB LEVEL", pct(value)); }
inline function onSubDrive(component, value) { SubOsc.setAttribute(SubOsc.SaturationAmount, value); show("SUB WARMTH", pct(value)); }
inline function onOctave(component, value)   { applyOctaves(); show(component == SubOct ? "SUB OCTAVE" : "GRIT OCTAVE", fmt(value, 0)); }
inline function onHarm(component, value)     { applyTarget(T_HARM); show("HARMONIC " + component.get("text"), pct(value)); }
inline function onGrit(component, value)     { applyTarget(T_GRIT); show("GRIT LEVEL", pct(value)); }
inline function onGritWave(component, value) { GritOsc.setAttribute(GritOsc.WaveForm1, WAVE_VALUES[value - 1]); show("GRIT WAVE", WAVE_NAMES[value - 1]); }
inline function onVolume(component, value)   { Output.setAttribute(Output.Gain, value); show("VOLUME", fmt(value, 1) + " dB"); }
inline function onVelSens(component, value)  { for (m in vels) m.setIntensity(value); show("VELOCITY SENS", pct(value)); }
inline function onMono(component, value)
{
	for (s in synths) s.setAttribute(s.VoiceLimit, value ? 1 : 16);
	show("VOICE MODE", value ? "MONO" : "POLY");
}
inline function onEnv(component, value)
{
	applyEnvelope();
	if (component.get("text") == "SUSTAIN") show("SUSTAIN", fmt(value, 0) + " %");
	else show(component.get("text"), fmtMs(value));
}

inline function onLowEnd(component, value)
{
	applyLowEnd();
	if (component == PunchAmt) show("PUNCH", "+" + fmt(value, 1) + " st pitch drop");
	else if (component == PunchTime) show("PUNCH DECAY", fmtMs(value));
	else show("DEEP (SUB OCTAVE)", pct(value));
}
PunchAmt.setControlCallback(onLowEnd);
PunchTime.setControlCallback(onLowEnd);
DeepLevel.setControlCallback(onLowEnd);

SubLevel.setControlCallback(onSubLevel);
SubDrive.setControlCallback(onSubDrive);
SubOct.setControlCallback(onOctave);
GritOct.setControlCallback(onOctave);
Harm2.setControlCallback(onHarm);
Harm3.setControlCallback(onHarm);
GritLevel.setControlCallback(onGrit);
GritWave.setControlCallback(onGritWave);
Volume.setControlCallback(onVolume);
VelSens.setControlCallback(onVelSens);
MonoBtn.setControlCallback(onMono);
Attack.setControlCallback(onEnv);
Decay.setControlCallback(onEnv);
Sustain.setControlCallback(onEnv);
Release.setControlCallback(onEnv);

// effects
inline function onFilter(component, value)
{
	applyTarget(T_CUTOFF);
	if (component == Cutoff) show("CUTOFF", fmtHz(value));
	else if (component == Resonance) show("RESONANCE", fmt(value, 2));
	else show("FILTER", value ? "ON" : "OFF");
}
inline function onFilterMode(component, value) { for (f in filters) f.setAttribute(f.Mode, FILTER_MODES[value - 1]); show("FILTER MODE", FILTER_NAMES[value - 1]); }
inline function onShape(component, value)
{
	applyTarget(T_DRIVE);
	if (component == ShapeDrive) show("POLYSHAPE DRIVE", fmt(value, 1) + " dB");
	else show("POLYSHAPE", value ? "ON" : "OFF");
}
inline function onShapeMode(component, value)
{
	SubShape.setAttribute(SubShape.Mode, SHAPE_VALUES[value - 1]);
	GritShape.setAttribute(GritShape.Mode, SHAPE_VALUES[value - 1]);
	show("POLYSHAPE CURVE", SHAPE_NAMES[value - 1]);
}
inline function onSat(component, value)
{
	applyTarget(T_SAT);
	if (component == SatAmount) show("SATURATION", pct(value));
	else show("SATURATOR", value ? "ON" : "OFF");
}
inline function onSatMix(component, value) { for (sa in sats) sa.setAttribute(sa.WetAmount, value); show("SATURATOR MIX", pct(value)); }
inline function onComp(component, value)
{
	Compressor.setBypassed(CompOn.getValue() == 0);
	Compressor.setAttribute(Compressor.CompressorThreshold, CompThresh.getValue());
	Compressor.setAttribute(Compressor.CompressorRatio, CompRatio.getValue());
	Compressor.setAttribute(Compressor.CompressorAttack, CompAttack.getValue());
	Compressor.setAttribute(Compressor.CompressorRelease, CompRelease.getValue());
	if (component == CompThresh) show("COMP THRESHOLD", fmt(value, 1) + " dB");
	else if (component == CompRatio) show("COMP RATIO", fmt(value, 1) + " : 1");
	else if (component == CompAttack) show("COMP ATTACK", fmt(value, 1) + " ms");
	else if (component == CompRelease) show("COMP RELEASE", fmtMs(value));
	else show("COMPRESSOR", value ? "ON" : "OFF");
}
inline function onLim(component, value)
{
	Limiter.setBypassed(LimOn.getValue() == 0);
	Limiter.setAttribute(Limiter.LimiterThreshold, LimCeiling.getValue());
	Limiter.setAttribute(Limiter.LimiterRelease, LimRelease.getValue());
	if (component == LimCeiling) show("LIMIT CEILING", fmt(value, 1) + " dB");
	else if (component == LimRelease) show("LIMIT RELEASE", fmtMs(value));
	else show("LIMITER", value ? "ON" : "OFF");
}
inline function onChorus(component, value)
{
	Chorus.setAttribute(Chorus.Rate, ChorusRate.getValue());
	applyTarget(T_CHORUS);
	if (component == ChorusRate) show("CHORUS RATE", pct(value));
	else if (component == ChorusDepth) show("CHORUS DEPTH", pct(value));
	else show("CHORUS", value ? "ON" : "OFF");
}
inline function onDelay(component, value)
{
	Delay.setAttribute(Delay.DelayTimeLeft,  DelayTime.getValue());
	Delay.setAttribute(Delay.DelayTimeRight, DelayTime.getValue());
	Delay.setAttribute(Delay.FeedbackLeft,  DelayFeedback.getValue());
	Delay.setAttribute(Delay.FeedbackRight, DelayFeedback.getValue());
	applyTarget(T_DELAY);
	if (component == DelayTime) show("DELAY TIME", fmtMs(value));
	else if (component == DelayFeedback) show("DELAY FEEDBACK", pct(value));
	else if (component == DelayMix) show("DELAY MIX", pct(value));
	else show("DELAY", value ? "ON" : "OFF");
}
inline function onReverb(component, value)
{
	Reverb.setAttribute(Reverb.RoomSize, ReverbSize.getValue());
	applyTarget(T_REVERB);
	if (component == ReverbSize) show("REVERB SIZE", pct(value));
	else if (component == ReverbMix) show("REVERB MIX", pct(value));
	else show("REVERB", value ? "ON" : "OFF");
}
inline function onWidth(component, value) { Output.setAttribute(Output.Width, value); show("STEREO WIDTH", fmt(value, 0) + " %"); }

FilterOn.setControlCallback(onFilter);
Cutoff.setControlCallback(onFilter);
Resonance.setControlCallback(onFilter);
FilterMode.setControlCallback(onFilterMode);
ShapeOn.setControlCallback(onShape);
ShapeDrive.setControlCallback(onShape);
ShapeMode.setControlCallback(onShapeMode);
SatOn.setControlCallback(onSat);
SatAmount.setControlCallback(onSat);
SatMix.setControlCallback(onSatMix);
CompOn.setControlCallback(onComp);
CompThresh.setControlCallback(onComp);
CompRatio.setControlCallback(onComp);
CompAttack.setControlCallback(onComp);
CompRelease.setControlCallback(onComp);
LimOn.setControlCallback(onLim);
LimCeiling.setControlCallback(onLim);
LimRelease.setControlCallback(onLim);
ChorusOn.setControlCallback(onChorus);
ChorusRate.setControlCallback(onChorus);
ChorusDepth.setControlCallback(onChorus);
DelayOn.setControlCallback(onDelay);
DelayTime.setControlCallback(onDelay);
DelayFeedback.setControlCallback(onDelay);
DelayMix.setControlCallback(onDelay);
ReverbOn.setControlCallback(onReverb);
ReverbSize.setControlCallback(onReverb);
ReverbMix.setControlCallback(onReverb);
Width.setControlCallback(onWidth);

// arp
inline function onArpLanes(component, value)
{
	local i = 0;
	local bv = ArpVel.getDataAsBuffer();
	local bp = ArpPitch.getDataAsBuffer();
	local bg = ArpGateLane.getDataAsBuffer();
	for (i = 0; i < 16; i++)
	{
		stepVel[i]   = bv[i];
		stepPitch[i] = bp[i];
		stepGate[i]  = bg[i];
	}
	if (component == ArpPitch) show("STEP PITCH", "edited");
	else if (component == ArpGateLane) show("STEP GATE", "edited");
	else if (component == ArpVel) show("STEP VELOCITY", "edited");
}
inline function onArpParam(component, value)
{
	if (component == ArpOn) show("ARPEGGIATOR", value ? "ON" : "OFF");
	else if (component == ArpLatch)
	{
		if (!value) arp.latchRelease = 1;
		show("LATCH", value ? "ON" : "OFF");
	}
	else if (component == ArpRate) show("ARP RATE", RATE_NAMES[value - 1]);
	else if (component == ArpMode) show("ARP MODE", ARP_MODES[value - 1]);
	else if (component == ArpVelMode) show("ARP VELOCITY", VEL_MODES[value - 1]);
	else if (component == ArpOct) show("ARP OCTAVES", fmt(value, 0));
	else if (component == ArpGate) show("ARP GATE", pct(value));
	else if (component == ArpSwing) show("ARP SWING", pct(value));
	else if (component == ArpSteps)
	{
		show("ARP STEPS", fmt(value, 0));
		// nudge a colour so the lanes redraw their greyed-out steps
		arpLaneTick = 1 - arpLaneTick;
		for (lane in [ArpVel, ArpPitch, ArpGateLane])
			lane.set("bgColour", arpLaneTick ? 0xFF04080B : 0xFF04080A);
	}
	else if (component == ArpTranspose) show("ARP TRANSPOSE", fmt(value, 0) + " st");
	pnlStepView.repaint();
}
inline function onArpRandom(component, value)
{
	local i = 0;
	local r = 0.0;
	if (value)
	{
		for (i = 0; i < 16; i++)
		{
			r = Math.random();
			ArpVel.setSliderAtIndex(i, r < 0.15 ? 0.0 : 0.4 + Math.random() * 0.6);
			ArpPitch.setSliderAtIndex(i, RANDOM_PITCHES[Math.floor(Math.random() * RANDOM_PITCHES.length) % RANDOM_PITCHES.length]);
			ArpGateLane.setSliderAtIndex(i, 0.3 + Math.random() * 0.7);
		}
		onArpLanes(ArpRandom, 0);
		show("STEP SEQUENCER", "RANDOMIZED");
	}
}
inline function onArpReset(component, value)
{
	if (value)
	{
		ArpVel.setAllValues(1.0);
		ArpPitch.setAllValues(0);
		ArpGateLane.setAllValues(1.0);
		onArpLanes(ArpReset, 0);
		show("STEP SEQUENCER", "RESET");
	}
}
ArpVel.setControlCallback(onArpLanes);
ArpPitch.setControlCallback(onArpLanes);
ArpGateLane.setControlCallback(onArpLanes);
ArpRandom.setControlCallback(onArpRandom);
ArpReset.setControlCallback(onArpReset);
ArpOn.setControlCallback(onArpParam);
ArpLatch.setControlCallback(onArpParam);
ArpRate.setControlCallback(onArpParam);
ArpMode.setControlCallback(onArpParam);
ArpVelMode.setControlCallback(onArpParam);
ArpOct.setControlCallback(onArpParam);
ArpGate.setControlCallback(onArpParam);
ArpSwing.setControlCallback(onArpParam);
ArpSteps.setControlCallback(onArpParam);
ArpTranspose.setControlCallback(onArpParam);

// xy
inline function onXY(component, value)
{
	applyAll();
	if (component == XPos || component == YPos)
	{
		pnlXY.data.trail.push([XPos.getValue(), YPos.getValue()]);
		if (pnlXY.data.trail.length > 28) pnlXY.data.trail.removeElement(0);
	}
	else if (component == XTarget) show("X AXIS", TARGET_NAMES[value - 1]);
	else if (component == YTarget) show("Y AXIS", TARGET_NAMES[value - 1]);
	else if (component == XDepth) show("X DEPTH", pct(value));
	else if (component == YDepth) show("Y DEPTH", pct(value));
	else if (component == XYOn) show("XY PAD", value ? "ACTIVE" : "OFF");
	pnlXY.repaint();
	pnlXYInfo.repaint();
}
inline function onXYReset(component, value)
{
	if (value)
	{
		XPos.setValue(0.5);
		YPos.setValue(0.5);
		XPos.changed();
		YPos.changed();
	}
}
XYOn.setControlCallback(onXY);
XTarget.setControlCallback(onXY);
YTarget.setControlCallback(onXY);
XDepth.setControlCallback(onXY);
YDepth.setControlCallback(onXY);
XPos.setControlCallback(onXY);
YPos.setControlCallback(onXY);
XYReset.setControlCallback(onXYReset);

// ---------------------------------------------------------------------
// EQ (the knobs always edit the selected band)
inline function eqIdx(p) { return eqState.band * 5 + p; }

inline function eqSyncFromModule()
{
	local i = 0;
	local t = 0;

	eqState.num = Math.min(EQ_MAX_BANDS, parseInt(EQ.getNumAttributes() / 5));

	if (eqState.band >= eqState.num)
		eqState.band = Math.max(0, eqState.num - 1);

	for (i = 0; i < EQ_MAX_BANDS; i++)
	{
		eqBandBtns[i].set("visible", i < eqState.num);
		eqBandBtns[i].setValue(i == eqState.band ? 1 : 0);
	}

	EqOn.setValue(EQ.isBypassed() ? 0 : 1);

	if (eqState.num > 0)
	{
		EqGain.setValue(EQ.getAttribute(eqIdx(0)));
		EqFreq.setValue(EQ.getAttribute(eqIdx(1)));
		EqQ.setValue(EQ.getAttribute(eqIdx(2)));
		EqBandOn.setValue(EQ.getAttribute(eqIdx(3)) > 0.5 ? 1 : 0);
		t = parseInt(EQ.getAttribute(eqIdx(4)));
		EqType.setValue(Math.range(t, 0, 4) + 1);
	}
}

inline function eqSelectBand(index)
{
	eqState.band = index;
	eqSyncFromModule();
	if (eqState.num > 0)
		show("EQ BAND " + (eqState.band + 1), EQ_TYPES[EqType.getValue() - 1] + "  " + fmtHz(EqFreq.getValue()));
	ftEQ.repaint();
}

inline function onEqBand(component, value)
{
	eqSelectBand(eqBandBtns.indexOf(component));
}

inline function onEqParam(component, value)
{
	if (eqState.num > 0)
	{
		if (component == EqGain)
		{
			EQ.setAttribute(eqIdx(0), value);
			show("EQ BAND " + (eqState.band + 1) + " GAIN", fmt(value, 1) + " dB");
		}
		else if (component == EqFreq)
		{
			EQ.setAttribute(eqIdx(1), value);
			show("EQ BAND " + (eqState.band + 1) + " FREQ", fmtHz(value));
		}
		else if (component == EqQ)
		{
			EQ.setAttribute(eqIdx(2), value);
			show("EQ BAND " + (eqState.band + 1) + " Q", fmt(value, 2));
		}
		else if (component == EqBandOn)
		{
			EQ.setAttribute(eqIdx(3), value);
			show("EQ BAND " + (eqState.band + 1), value ? "ON" : "OFF");
		}
		else if (component == EqType)
		{
			EQ.setAttribute(eqIdx(4), value - 1);
			show("EQ BAND " + (eqState.band + 1) + " TYPE", EQ_TYPES[value - 1]);
		}
	}
}

inline function onEqOn(component, value)
{
	EQ.setBypassed(value == 0);
	show("EQUALIZER", value ? "ON" : "OFF");
}

inline function onEqReset(component, value)
{
	if (value)
	{
		EQ.restoreState(EQ_DEFAULT_STATE);
		eqState.band = 0;
		eqSyncFromModule();
		show("EQUALIZER", "RESET");
	}
}

for (b in eqBandBtns) b.setControlCallback(onEqBand);
EqGain.setControlCallback(onEqParam);
EqFreq.setControlCallback(onEqParam);
EqQ.setControlCallback(onEqParam);
EqType.setControlCallback(onEqParam);
EqBandOn.setControlCallback(onEqParam);
EqOn.setControlCallback(onEqOn);
EqReset.setControlCallback(onEqReset);

// follow bands that are clicked, added or removed in the EQ display
const var eqEvents = Engine.createBroadcaster({"id": "EQ Events", "args": ["eventType", "value"]});
eqEvents.attachToEqEvents([EQ_ID], ["BandSelected", "BandAdded", "BandRemoved"], "");
eqEvents.addListener("", "EQ page", function(eventType, value)
{
	if (eventType == "BandSelected" && value >= 0)
		eqState.band = value;
	else if (eventType == "BandAdded" && value >= 0)
		eqState.band = value;

	eqSyncFromModule();
	ftEQ.repaint();
});

// ---------------------------------------------------------------------
// 9. PAINT ROUTINES & ANIMATION
// ---------------------------------------------------------------------
pnlBg.loadImage("{PROJECT_FOLDER}kb3d_bg.jpg", "bg3d");
pnlBg.setPaintRoutine(function(g)
{
	// 3D rendered chassis (header bar, preset slot, footer bar)
	g.drawImage("bg3d", [0, 0, 1000, 680], 0, 0);

	g.setFont("Oxygen Bold", 26);
	g.setColour(0x80000000);
	g.drawAlignedText("KNUCKLE", [25, 16, 120, 36], "left");
	g.drawAlignedText("BASS", [140, 16, 80, 36], "left");
	g.setColour(0xFFFFFFFF);
	g.drawAlignedText("KNUCKLE", [24, 14, 120, 36], "left");
	g.setColour(CYAN);
	g.drawAlignedText("BASS", [139, 14, 80, 36], "left");
	g.setFont("Oxygen", 10);
	g.setColour(TEXT_DIM);
	g.drawAlignedText("SUB  SYNTH", [208, 26, 90, 16], "left");

	g.setFont("Oxygen", 11);
	g.setColour(TEXT_DIM);
	g.drawAlignedText("KNUCKLEBASS  v1.0", [700, 652, 280, 22], "right");
});

// the plates themselves are part of the 3D render; this only draws the titles
inline function paintBoxes(g, boxes)
{
	local bx = 0;
	local by = 0;
	local bw = 0;

	for (b in boxes)
	{
		bx = b[0]; by = b[1]; bw = b[2];

		g.setColour(Colours.withAlpha(CYAN, 0.25));
		g.fillRoundedRectangle([bx + 22, by + 9, 7, 17], 2);
		g.setColour(CYAN);
		g.fillRoundedRectangle([bx + 24, by + 11, 3, 13], 1);

		g.setFont("Oxygen Bold", 13);
		g.setColour(0x90000000);
		g.drawAlignedText(b[4], [bx + 35, by + 10, bw - 100, 20], "left");
		g.setColour(0xFFE6FDFF);
		g.drawAlignedText(b[4], [bx + 34, by + 9, bw - 100, 20], "left");

		if (b.length > 5)
		{
			g.setFont("Oxygen", 9);
			g.setColour(TEXT_DIM);
			g.drawAlignedText(b[5], [bx + bw - 262, by + 11, 170, 16], "right");
		}
	}
}

pnlMain.loadImage("{PROJECT_FOLDER}kb3d_page_main.jpg", "page3d");
pnlFX.loadImage("{PROJECT_FOLDER}kb3d_page_fx.jpg", "page3d");
pnlEQ.loadImage("{PROJECT_FOLDER}kb3d_page_eq.jpg", "page3d");
pnlArp.loadImage("{PROJECT_FOLDER}kb3d_page_arp.jpg", "page3d");
pnlXYPage.loadImage("{PROJECT_FOLDER}kb3d_page_xy.jpg", "page3d");

const var pagePaint = function(g)
{
	g.drawImage("page3d", [0, 0, 1000, 568], 0, 0);
	paintBoxes(g, this.data.boxes);
};
pnlMain.setPaintRoutine(pagePaint);
pnlFX.setPaintRoutine(pagePaint);
pnlArp.setPaintRoutine(pagePaint);
pnlXYPage.setPaintRoutine(pagePaint);
pnlEQ.setPaintRoutine(pagePaint);

pnlPresetName.set("allowCallbacks", "Clicks & Hover");
pnlPresetName.setPaintRoutine(function(g)
{
	var name = Engine.getCurrentUserPresetName();
	if (name == "") name = "INIT";
	if (this.data.hover)
	{
		g.setColour(0x1800E5FF);
		g.fillRoundedRectangle([0, 0, this.getWidth(), this.getHeight()], 3);
	}
	g.setFont("Oxygen Bold", 12);
	g.setColour(this.data.hover ? 0xFFFFFFFF : CYAN);
	g.drawAlignedText(name.toUpperCase(), [6, 0, this.getWidth() - 12, this.getHeight()], "centred");
});
pnlPresetName.setMouseCallback(function(event)
{
	this.data.hover = event.hover;
	if (event.clicked)
		pnlBrowser.set("visible", !pnlBrowser.get("visible"));
	this.repaint();
});

pnlBrowser.setPaintRoutine(function(g)
{
	g.fillAll(0xF5000000);
	g.setColour(EDGE);
	g.drawRect([10, 10, 980, 540], 1);
});


// ---------------------------------------------------------------------
// LIVE DISPLAYS (main + effects pages)
// ---------------------------------------------------------------------
const var vizState = {"t": 0.0, "peakL": 0.0, "peakR": 0.0, "holdL": 0.0, "holdR": 0.0};

inline function vizFrame(g, w, h)
{
	g.setColour(0xFF030607);
	g.fillRoundedRectangle([0, 0, w, h], 4);
	g.setColour(0x1000E5FF);
	g.fillRect([0, h / 2, w, 1]);
	g.setColour(0xFF12313A);
	g.drawRoundedRectangle([0.5, 0.5, w - 1, h - 1], 4, 1);
}

inline function vizCurve(g, p, w, h, active)
{
	g.setColour(Colours.withAlpha(CYAN, active ? 0.22 : 0.08));
	g.drawPath(p, [0, 0, w, h], 5);
	g.setColour(active ? CYAN : 0xFF2A4A50);
	g.drawPath(p, [0, 0, w, h], 1.6);
}

inline function vizLabel(g, text, w, h)
{
	g.setFont("Oxygen Bold", 9);
	g.setColour(TEXT_DIM);
	g.drawAlignedText(text, [6, 3, w - 12, 12], "left");
}

inline function shapeFn(x, mode, drive)
{
	local d = Engine.getGainFactorForDecibels(drive);
	local v = x * d;
	local r = v;
	if (mode == 1) r = 2.0 / Math.PI * Math.atan(v * 1.5);
	else if (mode == 2) r = Math.tanh(v);
	else if (mode == 3) r = Math.range(v * Math.abs(v), -1, 1);
	else if (mode == 4) r = Math.range(v >= 0 ? Math.sqrt(Math.abs(v)) : -Math.sqrt(Math.abs(v)), -1, 1);
	else if (mode == 5) r = v / (1.0 + Math.abs(v));
	else if (mode == 6) r = Math.sin(Math.range(v, -1.5708, 1.5708));
	return Math.range(r, -1, 1);
}

inline function grDb(gr)
{
	local d = 0.0;
	if (gr > 0.00001 && gr < 1.0) d = -20.0 * Math.log10(gr);
	return Math.range(d, 0, 24);
}

const var vizPaint = function(g)
{
	var w = this.getWidth();
	var h = this.getHeight();
	var k = this.data.kind;
	var t = vizState.t;
	var p = Content.createPath();
	var n = 64;
	var i = 0;
	var x = 0.0;
	var y = 0.0;

	if (k == "subwave")
	{
		vizFrame(g, w, h);
		p.startNewSubPath(0, 0); p.startNewSubPath(1, 1);
		for (i = 0; i <= n; i++)
		{
			x = i / n;
			y = Math.sin(x * Math.PI * 4 + t * 0.6) * (0.5 + 1.8 * SubDrive.getValue());
			y = Math.tanh(y) / Math.tanh(0.5 + 1.8 * SubDrive.getValue());
			y = 0.5 - y * 0.38 * (0.25 + 0.75 * SubLevel.getValue());
			if (i == 0) p.startNewSubPath(x, y); else p.lineTo(x, y);
		}
		vizCurve(g, p, w, h, SubLevel.getValue() > 0.01);
		vizLabel(g, "SUB  " + (SubOct.getValue() > 0 ? "+" : "") + parseInt(SubOct.getValue()) + " OCT", w, h);
	}
	else if (k == "gritwave")
	{
		vizFrame(g, w, h);
		var wv = GritWave.getValue();
		p.startNewSubPath(0, 0); p.startNewSubPath(1, 1);
		for (i = 0; i <= n; i++)
		{
			x = i / n;
			var ph = (x * 3 + t * 0.15) % 1.0;
			if (wv == 1) y = 1 - 2 * ph;
			else if (wv == 2) y = ph < 0.5 ? 1 : -1;
			else y = 1 - 4 * Math.abs(ph - 0.5);
			y = 0.5 - y * 0.36 * (0.3 + 0.7 * Math.min(1, GritLevel.getValue() * 3));
			if (i == 0) p.startNewSubPath(x, y); else p.lineTo(x, y);
		}
		vizCurve(g, p, w, h, GritLevel.getValue() > 0.01);
		vizLabel(g, WAVE_NAMES[wv - 1].toUpperCase(), w, h);
	}
	else if (k == "harm")
	{
		vizFrame(g, w, h);
		var vals = [SubLevel.getValue(), Harm2.getValue(), Harm3.getValue(), GritLevel.getValue(), DeepLevel.getValue()];
		var names = ["F", "2", "3", "G", "D"];
		var bw = (w - 16) / 5;
		for (i = 0; i < 5; i++)
		{
			var bh = (h - 34) * Math.range(vals[i], 0, 1);
			var bx = 8 + i * bw;
			g.setColour(0xFF0A1416);
			g.fillRoundedRectangle([bx + 3, 18, bw - 6, h - 34], 2);
			g.setGradientFill([CYAN, 0, h - 16 - bh, 0x5500E5FF, 0, h - 16, false]);
			g.fillRoundedRectangle([bx + 3, h - 16 - bh, bw - 6, bh], 2);
			g.setColour(Colours.withAlpha(CYAN, 0.25));
			g.fillRect([bx + 1, h - 18 - bh, bw - 2, 2]);
			g.setFont("Oxygen Bold", 9);
			g.setColour(TEXT_DIM);
			g.drawAlignedText(names[i], [bx, h - 15, bw, 12], "centred");
		}
		vizLabel(g, "SPECTRUM", w, h);
	}
	else if (k == "lowmeter")
	{
		vizFrame(g, w, h);
		var lv = Math.range(pnlWoofer.data.pulse * 1.1, 0, 1);
		var segs = 12;
		var sh = (h - 22) / segs;
		for (i = 0; i < segs; i++)
		{
			var on = (i + 1) / segs <= lv;
			var col = i >= segs - 2 ? 0xFFFF4D6A : CYAN;
			g.setColour(on ? col : 0xFF0A1416);
			g.fillRoundedRectangle([10, h - 8 - (i + 1) * sh + 1, w - 20, sh - 2], 1.5);
		}
		g.setFont("Oxygen Bold", 8);
		g.setColour(TEXT_DIM);
		g.drawAlignedText("SUB", [0, 2, w, 10], "centred");
	}
	else if (k == "voice")
	{
		vizFrame(g, w, h);
		g.setFont("Oxygen Bold", 10);
		g.setColour(TEXT_DIM);
		g.drawAlignedText("VOICES", [8, 0, 60, h], "left");
		g.setColour(CYAN);
		g.drawAlignedText(MonoBtn.getValue() ? "MONO  1" : "POLY  16", [8, 0, w - 16, h], "right");
	}
	else if (k == "meter")
	{
		vizFrame(g, w, h);
		var segs2 = 20;
		var mh = (h - 40) / segs2;
		var lvls = [vizState.peakL, vizState.peakR];
		var holds = [vizState.holdL, vizState.holdR];
		var ch = 0;
		for (ch = 0; ch < 2; ch++)
		{
			var mx = 14 + ch * 36;
			for (i = 0; i < segs2; i++)
			{
				var lit = (i + 1) / segs2 <= lvls[ch];
				var c2 = i >= segs2 - 3 ? 0xFFFF4D6A : (i >= segs2 - 7 ? 0xFF7FF4FF : CYAN);
				g.setColour(lit ? c2 : 0xFF0A1416);
				g.fillRoundedRectangle([mx, h - 22 - (i + 1) * mh + 1, 26, mh - 2], 1);
			}
			var hy = h - 22 - holds[ch] * (h - 40);
			g.setColour(0xFFFFFFFF);
			g.fillRect([mx, hy, 26, 2]);
			g.setFont("Oxygen Bold", 9);
			g.setColour(TEXT_DIM);
			g.drawAlignedText(ch == 0 ? "L" : "R", [mx, h - 18, 26, 12], "centred");
		}
		var db = Engine.getDecibelsForGainFactor(Math.max(vizState.holdL, vizState.holdR) + 0.000001);
		g.setFont("Oxygen Bold", 9);
		g.setColour(CYAN);
		g.drawAlignedText(db < -60 ? "-INF" : Engine.doubleToString(db, 1), [0, 3, w, 12], "centred");
	}
	else if (k == "filter")
	{
		vizFrame(g, w, h);
		var fm = FILTER_MODES[FilterMode.getValue() - 1];
		var fc = normLog(Cutoff.getValue(), 20, 20000);
		var q = (Resonance.getValue() - 0.3) / 9.6;
		p.startNewSubPath(0, 0); p.startNewSubPath(1, 1);
		for (i = 0; i <= n; i++)
		{
			x = i / n;
			var dx = (x - fc) * 9.0;
			var mag = 0.0;
			if (fm == 7) mag = 1.0 / (1.0 + Math.exp(-dx * 1.6));
			else if (fm == 13) mag = Math.exp(-dx * dx * 0.5);
			else mag = 1.0 / (1.0 + Math.exp(dx * 1.6));
			mag = mag + q * 0.9 * Math.exp(-dx * dx * 2.0);
			y = 0.85 - mag * 0.55;
			if (i == 0) p.startNewSubPath(x, y); else p.lineTo(x, y);
		}
		vizCurve(g, p, w, h, FilterOn.getValue() || xyHas(T_CUTOFF) || xyHas(T_RES));
		vizLabel(g, FILTER_NAMES[FilterMode.getValue() - 1].toUpperCase(), w, h);
	}
	else if (k == "shape" || k == "sat")
	{
		vizFrame(g, w, h);
		g.setColour(0x1000E5FF);
		g.fillRect([w / 2, 0, 1, h]);
		var lin = Content.createPath();
		lin.startNewSubPath(0, 0); lin.startNewSubPath(1, 1);
		lin.startNewSubPath(0, 1); lin.lineTo(1, 0);
		g.setColour(0x2000E5FF);
		g.drawPath(lin, [0, 0, w, h], 1);
		p.startNewSubPath(0, 0); p.startNewSubPath(1, 1);
		for (i = 0; i <= n; i++)
		{
			x = i / n;
			var xin = x * 2 - 1;
			var o = 0.0;
			if (k == "shape")
				o = shapeFn(xin, ShapeMode.getValue(), ShapeDrive.getValue());
			else
			{
				var a = SatAmount.getValue();
				var kk = 2 * a / (1 - a + 0.0001);
				var sat = (1 + kk) * xin / (1 + kk * Math.abs(xin));
				o = xin + (sat - xin) * SatMix.getValue();
			}
			y = 0.5 - o * 0.42;
			if (i == 0) p.startNewSubPath(x, y); else p.lineTo(x, y);
		}
		if (k == "shape")
		{
			vizCurve(g, p, w, h, ShapeOn.getValue() || xyHas(T_DRIVE));
			vizLabel(g, "TRANSFER  " + SHAPE_NAMES[ShapeMode.getValue() - 1].toUpperCase(), w, h);
		}
		else
		{
			vizCurve(g, p, w, h, SatOn.getValue() || xyHas(T_SAT));
			vizLabel(g, "TRANSFER", w, h);
		}
	}
	else if (k == "comp" || k == "lim")
	{
		vizFrame(g, w, h);
		var isComp = k == "comp";
		var mod = isComp ? Compressor : Limiter;
		var gr = grDb(mod.getAttribute(isComp ? mod.CompressorReduction : mod.LimiterReduction));
		var on2 = isComp ? CompOn.getValue() : LimOn.getValue();
		if (isComp)
		{
			g.setFont("Oxygen Bold", 9);
			g.setColour(TEXT_DIM);
			g.drawAlignedText("GR", [6, 0, 24, h], "left");
			g.setColour(0xFF0A1416);
			g.fillRoundedRectangle([30, h / 2 - 5, w - 90, 10], 3);
			g.setColour(on2 ? CYAN : 0xFF2A4A50);
			g.fillRoundedRectangle([30, h / 2 - 5, (w - 90) * gr / 24.0, 10], 3);
			g.setColour(CYAN);
			g.drawAlignedText("-" + Engine.doubleToString(gr, 1) + " dB", [w - 58, 0, 52, h], "right");
		}
		else
		{
			var lvl = Math.max(vizState.peakL, vizState.peakR);
			var ceil = Engine.getGainFactorForDecibels(LimCeiling.getValue());
			var cy = h - 22 - (h - 40) * Math.range(ceil, 0, 1);
			g.setColour(0xFF0A1416);
			g.fillRoundedRectangle([14, 18, 30, h - 40], 3);
			g.setColour(on2 ? CYAN : 0xFF2A4A50);
			g.fillRoundedRectangle([14, h - 22 - (h - 40) * Math.range(lvl, 0, 1), 30, (h - 40) * Math.range(lvl, 0, 1)], 3);
			g.setColour(0xFFFF4D6A);
			g.fillRect([8, cy, 42, 2]);
			g.setColour(0xFF0A1416);
			g.fillRoundedRectangle([62, 18, 22, h - 40], 3);
			g.setColour(0xFFFF4D6A);
			g.fillRoundedRectangle([62, 18, 22, (h - 40) * gr / 24.0], 3);
			g.setFont("Oxygen Bold", 9);
			g.setColour(TEXT_DIM);
			g.drawAlignedText("OUT", [8, h - 18, 42, 12], "centred");
			g.drawAlignedText("GR", [56, h - 18, 34, 12], "centred");
			g.setColour(CYAN);
			g.drawAlignedText(Engine.doubleToString(gr, 1), [86, 18, w - 90, 12], "centred");
		}
	}
	else if (k == "chorus")
	{
		vizFrame(g, w, h);
		var rate = 0.2 + ChorusRate.getValue() * 2.5;
		var dep = ChorusDepth.getValue();
		var act = ChorusOn.getValue() || xyHas(T_CHORUS);
		var v2 = 0;
		for (v2 = 0; v2 < 2; v2++)
		{
			var pp = Content.createPath();
			pp.startNewSubPath(0, 0); pp.startNewSubPath(1, 1);
			for (i = 0; i <= n; i++)
			{
				x = i / n;
				y = 0.5 - Math.sin(x * Math.PI * 2 * rate + t * rate * 0.5 + v2 * Math.PI) * 0.38 * dep;
				if (i == 0) pp.startNewSubPath(x, y); else pp.lineTo(x, y);
			}
			vizCurve(g, pp, w, h, act && v2 == 0);
		}
		vizLabel(g, "LFO", w, h);
	}
	else if (k == "delay")
	{
		vizFrame(g, w, h);
		var fb = DelayFeedback.getValue();
		var mixd = DelayMix.getValue();
		var act2 = DelayOn.getValue() || xyHas(T_DELAY);
		var step = Math.range(DelayTime.getValue() / 1000.0, 0.05, 1.0) * (w - 20) * 0.32;
		var amp = 1.0;
		g.setColour(0xFFE6FDFF);
		g.fillRect([10, 4, 3, h - 8]);
		for (i = 1; i < 12; i++)
		{
			amp = (i == 1 ? mixd : amp * fb);
			var xx = 10 + i * step;
			if (xx > w - 6 || amp < 0.02) break;
			g.setColour(act2 ? Colours.withAlpha(CYAN, 0.3 + 0.7 * amp) : 0xFF2A4A50);
			var hh = (h - 8) * Math.range(amp, 0.05, 1.0);
			g.fillRect([xx, h / 2 - hh / 2, 3, hh]);
		}
	}
	else if (k == "reverb")
	{
		vizFrame(g, w, h);
		var size = ReverbSize.getValue();
		var mixr = ReverbMix.getValue();
		var act3 = ReverbOn.getValue() || xyHas(T_REVERB);
		p.startNewSubPath(0, 0); p.startNewSubPath(1, 1);
		p.startNewSubPath(0, 1);
		for (i = 0; i <= n; i++)
		{
			x = i / n;
			var env = Math.exp(-x * (8.0 - size * 6.5));
			var noise = 0.75 + 0.25 * Math.sin(i * 12.9898 + t * 0.2);
			y = 1.0 - env * (0.25 + 0.7 * mixr) * noise;
			p.lineTo(x, y);
		}
		p.lineTo(1, 1);
		p.closeSubPath();
		g.setColour(act3 ? 0x3300E5FF : 0x1000E5FF);
		g.fillPath(p, [0, 0, w, h]);
		vizCurve(g, p, w, h, act3);
		vizLabel(g, "DECAY", w, h);
	}
	else if (k == "stereo")
	{
		vizFrame(g, w, h);
		var wd = Width.getValue() / 200.0;
		var cx2 = w / 2;
		var cy2 = h / 2 + 4;
		g.setColour(0x1400E5FF);
		g.fillRect([cx2, 6, 1, h - 12]);
		var ew = (w - 30) * (0.05 + 0.95 * wd);
		var eh = (h - 30) * (1.0 - 0.35 * wd);
		g.setColour(0x2200E5FF);
		g.fillEllipse([cx2 - ew / 2, cy2 - eh / 2, ew, eh]);
		g.setColour(CYAN);
		g.drawEllipse([cx2 - ew / 2, cy2 - eh / 2, ew, eh], 1.5);
		var bl = vizState.peakL;
		var br = vizState.peakR;
		g.setColour(0xFF0A1416);
		g.fillRoundedRectangle([8, h - 12, w / 2 - 12, 6], 2);
		g.fillRoundedRectangle([w / 2 + 4, h - 12, w / 2 - 12, 6], 2);
		g.setColour(CYAN);
		g.fillRoundedRectangle([w / 2 - 4 - (w / 2 - 12) * bl, h - 12, (w / 2 - 12) * bl, 6], 2);
		g.fillRoundedRectangle([w / 2 + 4, h - 12, (w / 2 - 12) * br, 6], 2);
		vizLabel(g, wd < 0.02 ? "MONO" : "FIELD", w, h);
	}
};

for (v in mainViz) v.setPaintRoutine(vizPaint);
for (v in fxViz) v.setPaintRoutine(vizPaint);

// --- envelope display ---
pnlEnv.setPaintRoutine(function(g)
{
	var w = this.getWidth();
	var h = this.getHeight();
	g.setColour(0xFF030607);
	g.fillRoundedRectangle([0, 0, w, h], 4);
	g.setColour(0x1400E5FF);
	for (i = 1; i < 8; i++) g.fillRect([i * w / 8, 0, 1, h]);
	for (i = 1; i < 4; i++) g.fillRect([0, i * h / 4, w, 1]);

	var a = Math.sqrt(Attack.getValue());
	var d = Math.sqrt(Decay.getValue());
	var r = Math.sqrt(Release.getValue());
	var total = a + d + r;
	var usable = w * 0.75 - 12;
	var x0 = 6;
	var top = 10;
	var bottom = h - 8;
	var xa = x0 + usable * a / total;
	var xd = xa + usable * d / total;
	var xs = xd + w * 0.25;
	var ys = bottom - (bottom - top) * Sustain.getValue() / 100.0;
	var xr = Math.min(w - 6, xs + usable * r / total);

	var p = Content.createPath();
	p.startNewSubPath(x0, bottom);
	p.lineTo(xa, top);
	p.lineTo(xd, ys);
	p.lineTo(xs, ys);
	p.lineTo(xr, bottom);

	var fillP = Content.createPath();
	fillP.startNewSubPath(x0, bottom);
	fillP.lineTo(xa, top);
	fillP.lineTo(xd, ys);
	fillP.lineTo(xs, ys);
	fillP.lineTo(xr, bottom);
	fillP.closeSubPath();

	g.setGradientFill([0x4400E5FF, 0, top, 0x0000E5FF, 0, bottom, false]);
	g.fillPath(fillP, [x0, top, xr - x0, bottom - top]);
	g.setColour(CYAN);
	g.drawPath(p, [x0, top, xr - x0, bottom - top], 2);
	g.setColour(EDGE);
	g.drawRoundedRectangle([0.5, 0.5, w - 1, h - 1], 4, 1);
});

// --- pulsing sub woofer ---
pnlWoofer.loadImage("{PROJECT_FOLDER}kb3d_woofer_frame.png", "frame");
pnlWoofer.loadImage("{PROJECT_FOLDER}kb3d_woofer_cone.png", "cone");
pnlWoofer.data.pulse = 0.0;
pnlWoofer.data.phase = 0.0;
pnlWoofer.data.lastHits = 0;
pnlWoofer.data.rings = [];
pnlWoofer.data.tick = 0;
pnlWoofer.data.lastStep = -1;

pnlWoofer.setPaintRoutine(function(g)
{
	var w = this.getWidth();
	var h = this.getHeight();
	var p = this.data.pulse;
	var size = Math.min(w, h) - 40;
	var cx = w / 2;
	var cy = h / 2;

	// ambient glow
	var gs = size * (0.62 + 0.18 * p);
	g.setGradientFill([Colours.withAlpha(CYAN, 0.03 + 0.30 * p), cx, cy, 0x0000E5FF, cx, cy + gs, true]);
	g.fillEllipse([cx - gs, cy - gs, gs * 2, gs * 2]);

	// shock-wave rings
	for (r in this.data.rings)
	{
		var rr = size * 0.5 + r[0];
		g.setColour(Colours.withAlpha(CYAN, r[1]));
		g.drawEllipse([cx - rr, cy - rr, rr * 2, rr * 2], 2);
	}

	// cone excursion
	var wobble = Math.sin(this.data.phase) * 0.35 * p;
	var cs = size * (0.985 + 0.06 * (p + wobble * 0.3));
	g.setColour(0xFFFFFFFF);
	g.drawImage("cone", [cx - cs / 2, cy - cs / 2, cs, cs], 0, 0);
	g.drawImage("frame", [cx - size / 2, cy - size / 2, size, size], 0, 0);

	// dust cap flare
	var fs = size * (0.10 + 0.08 * p);
	g.setGradientFill([Colours.withAlpha(CYAN, 0.15 + 0.55 * p), cx, cy, 0x0000E5FF, cx, cy + fs, true]);
	g.fillEllipse([cx - fs, cy - fs, fs * 2, fs * 2]);
});

pnlWoofer.setTimerCallback(function()
{
	var lvl = Math.max(Output.getCurrentLevel(1), Output.getCurrentLevel(0));
	var target = Math.min(1.0, Math.pow(Math.max(lvl, 0.0), 0.6) * 1.3);

	if (target > this.data.pulse)
		this.data.pulse = this.data.pulse + (target - this.data.pulse) * 0.6;
	else
		this.data.pulse = this.data.pulse * 0.86;

	// idle breathing
	this.data.phase = this.data.phase + 1.9;
	this.data.tick = this.data.tick + 1;
	if (this.data.pulse < 0.04)
		this.data.pulse = 0.02 + 0.02 * Math.sin(this.data.tick * 0.06);

	// new note -> shock ring
	if (vis.hits != this.data.lastHits)
	{
		this.data.lastHits = vis.hits;
		this.data.rings.push([0.0, 0.7]);
	}

	var alive = [];
	for (r in this.data.rings)
	{
		r[0] = r[0] + 3.0;
		r[1] = r[1] * 0.9;
		if (r[1] > 0.03) alive.push(r);
	}
	this.data.rings = alive;

	this.repaint();

	if (pnlArp.get("visible"))
	{
		pnlStepView.repaint();

		if (arp.display != this.data.lastStep)
		{
			this.data.lastStep = arp.display;
			if (arp.display >= 0)
			{
				// reading a slider makes the pack flash that step
				ArpVel.getSliderValueAt(arp.display);
				ArpPitch.getSliderValueAt(arp.display);
				ArpGateLane.getSliderValueAt(arp.display);
			}
		}
	}
	if (this.data.tick % 15 == 0) pnlPresetName.repaint();

	// output meters for the displays
	var oL = Output.getCurrentLevel(1);
	var oR = Output.getCurrentLevel(0);
	vizState.t = vizState.t + 0.35;
	vizState.peakL = Math.max(oL, vizState.peakL * 0.82);
	vizState.peakR = Math.max(oR, vizState.peakR * 0.82);
	vizState.holdL = Math.max(oL, vizState.holdL - 0.008);
	vizState.holdR = Math.max(oR, vizState.holdR - 0.008);

	if (pnlMain.get("visible") && this.data.tick % 2 == 0)
		for (v in mainViz) v.repaint();
	if (pnlFX.get("visible") && this.data.tick % 2 == 0)
		for (v in fxViz) v.repaint();
	if (pnlEQ.get("visible") && this.data.tick % 5 == 0) eqSyncFromModule();
});
pnlWoofer.startTimer(33);

// --- arp step indicator ---
pnlStepView.setPaintRoutine(function(g)
{
	var w = this.getWidth();
	var h = this.getHeight();
	var cw = w / 16;
	var steps = ArpSteps.getValue();
	var on = ArpOn.getValue();
	for (i = 0; i < 16; i++)
	{
		var r = [i * cw + 2, 1, cw - 4, h - 2];
		if (i >= steps)
		{
			g.setColour(0xFF040506);
			g.fillRoundedRectangle(r, 2);
		}
		else if (i == arp.display && on)
		{
			g.setColour(Colours.withAlpha(CYAN, 0.35));
			g.fillRoundedRectangle([r[0] - 2, 0, r[2] + 4, h], 3);
			g.setColour(CYAN);
			g.fillRoundedRectangle(r, 2);
		}
		else if (stepVel[i] < 0.01)
		{
			g.setColour(0xFF1A3036);
			g.drawRoundedRectangle([r[0] + 0.5, r[1] + 0.5, r[2] - 1, r[3] - 1], 2, 1);
		}
		else
		{
			g.setColour(Colours.withAlpha(CYAN, 0.08 + 0.22 * stepVel[i]));
			g.fillRoundedRectangle(r, 2);
		}
	}
});

// --- XY pad ---
pnlXY.data.trail = [];
pnlXY.setPaintRoutine(function(g)
{
	var w = this.getWidth();
	var h = this.getHeight();
	var on = XYOn.getValue();

	g.setColour(0xFF020506);
	g.fillRoundedRectangle([0, 0, w, h], 6);

	g.setColour(0x1200E5FF);
	for (i = 1; i < 12; i++)
	{
		g.fillRect([i * w / 12, 0, 1, h]);
		g.fillRect([0, i * h / 12, w, 1]);
	}
	g.setColour(0x3000E5FF);
	g.fillRect([w / 2, 0, 1, h]);
	g.fillRect([0, h / 2, w, 1]);

	var px = XPos.getValue() * w;
	var py = (1.0 - YPos.getValue()) * h;

	// trail
	var n = this.data.trail.length;
	for (k = 0; k < n; k++)
	{
		var tp = this.data.trail[k];
		var al = 0.35 * (k + 1) / n;
		var ts = 4 + 8 * (k + 1) / n;
		g.setColour(Colours.withAlpha(CYAN, on ? al : al * 0.3));
		g.fillEllipse([tp[0] * w - ts / 2, (1.0 - tp[1]) * h - ts / 2, ts, ts]);
	}

	// crosshair
	g.setColour(Colours.withAlpha(CYAN, on ? 0.35 : 0.12));
	g.fillRect([px, 0, 1, h]);
	g.fillRect([0, py, w, 1]);

	// puck
	g.setGradientFill([Colours.withAlpha(CYAN, on ? 0.5 : 0.15), px, py, 0x0000E5FF, px, py + 60, true]);
	g.fillEllipse([px - 60, py - 60, 120, 120]);
	g.setColour(on ? CYAN : 0xFF2A4A50);
	g.drawEllipse([px - 16, py - 16, 32, 32], 2);
	g.fillEllipse([px - 7, py - 7, 14, 14]);

	// axis names
	g.setFont("Oxygen Bold", 12);
	g.setColour(on ? TEXT : TEXT_DIM);
	g.drawAlignedText("X : " + TARGET_NAMES[XTarget.getValue() - 1].toUpperCase(), [12, h - 26, w - 24, 18], "right");
	g.drawAlignedText("Y : " + TARGET_NAMES[YTarget.getValue() - 1].toUpperCase(), [12, 8, w - 24, 18], "left");
	if (!on)
	{
		g.setFont("Oxygen Bold", 16);
		g.drawAlignedText("XY PAD OFF", [0, 0, w, h], "centred");
	}

	g.setColour(on ? Colours.withAlpha(CYAN, 0.6) : EDGE);
	g.drawRoundedRectangle([0.5, 0.5, w - 1, h - 1], 6, 1);
});

pnlXY.setMouseCallback(function(event)
{
	if (event.doubleClick)
	{
		XPos.setValue(0.5);
		YPos.setValue(0.5);
		XPos.changed();
		YPos.changed();
	}
	else if (event.clicked || event.drag)
	{
		var mx = event.drag ? event.mouseDownX + event.dragX : event.x;
		var my = event.drag ? event.mouseDownY + event.dragY : event.y;
		XPos.setValue(Math.range(mx / this.getWidth(), 0.0, 1.0));
		YPos.setValue(Math.range(1.0 - my / this.getHeight(), 0.0, 1.0));
		XPos.changed();
		YPos.changed();
	}
});

pnlXYInfo.setPaintRoutine(function(g)
{
	var w = this.getWidth();
	g.setColour(0xFF030607);
	g.fillRoundedRectangle([0, 0, w, this.getHeight()], 4);
	g.setColour(EDGE);
	g.drawRoundedRectangle([0.5, 0.5, w - 1, this.getHeight() - 1], 4, 1);

	g.setFont("Oxygen Bold", 12);
	g.setColour(TEXT_DIM);
	g.drawAlignedText("X POSITION", [16, 14, 150, 18], "left");
	g.drawAlignedText("Y POSITION", [16, 74, 150, 18], "left");

	g.setFont("Oxygen Bold", 22);
	g.setColour(CYAN);
	g.drawAlignedText(fmt(XPos.getValue() * 100, 0) + " %", [16, 32, 150, 28], "left");
	g.drawAlignedText(fmt(YPos.getValue() * 100, 0) + " %", [16, 92, 150, 28], "left");

	g.setFont("Oxygen Bold", 12);
	g.setColour(TEXT);
	g.drawAlignedText(TARGET_NAMES[XTarget.getValue() - 1], [170, 38, w - 186, 18], "right");
	g.drawAlignedText(TARGET_NAMES[YTarget.getValue() - 1], [170, 98, w - 186, 18], "right");

	// bars
	g.setColour(0xFF0A1416);
	g.fillRect([16, 64, w - 32, 3]);
	g.fillRect([16, 124, w - 32, 3]);
	g.setColour(CYAN);
	g.fillRect([16, 64, (w - 32) * XPos.getValue(), 3]);
	g.fillRect([16, 124, (w - 32) * YPos.getValue(), 3]);

	g.setFont("Oxygen", 11);
	g.setColour(TEXT_DIM);
	g.drawAlignedText("Drag the puck to sweep. Double-click the pad to centre it.", [16, 150, w - 32, 18], "left");
	g.drawAlignedText("Cutoff is bipolar around the centre line; every other", [16, 170, w - 32, 18], "left");
	g.drawAlignedText("target adds on top of its Effects-page setting and", [16, 186, w - 32, 18], "left");
	g.drawAlignedText("switches that effect on while the pad drives it.", [16, 202, w - 32, 18], "left");
});

// ---------------------------------------------------------------------
// 10. INITIALISE
// ---------------------------------------------------------------------
pnlFX.set("visible", false);
pnlArp.set("visible", false);
pnlXYPage.set("visible", false);
pnlEQ.set("visible", false);
pnlMain.set("visible", true);

// default step-velocity groove (preset-restored values replace this)
const var DEFAULT_GROOVE = [1.0, 0.45, 0.7, 0.45, 0.9, 0.45, 0.7, 0.0, 1.0, 0.45, 0.7, 0.45, 0.9, 0.0, 0.8, 0.55];
for (i = 0; i < 16; i++) ArpVel.setSliderAtIndex(i, DEFAULT_GROOVE[i]);
ArpPitch.setAllValues(0);
ArpGateLane.setAllValues(1.0);
onArpLanes(ArpVel, 0);

applyLowEnd();
eqSyncFromModule();

// apply every control once (changed() is skipped during onInit)
onSubLevel(SubLevel, SubLevel.getValue());
onSubDrive(SubDrive, SubDrive.getValue());
onOctave(SubOct, SubOct.getValue());
onOctave(GritOct, GritOct.getValue());
onHarm(Harm2, Harm2.getValue());
onHarm(Harm3, Harm3.getValue());
onGrit(GritLevel, GritLevel.getValue());
onGritWave(GritWave, GritWave.getValue());
onVolume(Volume, Volume.getValue());
onVelSens(VelSens, VelSens.getValue());
onMono(MonoBtn, MonoBtn.getValue());
onEnv(Attack, Attack.getValue());
onEnv(Decay, Decay.getValue());
onEnv(Sustain, Sustain.getValue());
onEnv(Release, Release.getValue());
onFilter(FilterOn, FilterOn.getValue());
onFilter(Cutoff, Cutoff.getValue());
onFilter(Resonance, Resonance.getValue());
onFilterMode(FilterMode, FilterMode.getValue());
onShape(ShapeOn, ShapeOn.getValue());
onShape(ShapeDrive, ShapeDrive.getValue());
onShapeMode(ShapeMode, ShapeMode.getValue());
onSat(SatOn, SatOn.getValue());
onSat(SatAmount, SatAmount.getValue());
onSatMix(SatMix, SatMix.getValue());
onComp(CompOn, CompOn.getValue());
onComp(CompThresh, CompThresh.getValue());
onComp(CompRatio, CompRatio.getValue());
onComp(CompAttack, CompAttack.getValue());
onComp(CompRelease, CompRelease.getValue());
onLim(LimOn, LimOn.getValue());
onLim(LimCeiling, LimCeiling.getValue());
onLim(LimRelease, LimRelease.getValue());
onChorus(ChorusOn, ChorusOn.getValue());
onChorus(ChorusRate, ChorusRate.getValue());
onChorus(ChorusDepth, ChorusDepth.getValue());
onDelay(DelayOn, DelayOn.getValue());
onDelay(DelayTime, DelayTime.getValue());
onDelay(DelayFeedback, DelayFeedback.getValue());
onDelay(DelayMix, DelayMix.getValue());
onReverb(ReverbOn, ReverbOn.getValue());
onReverb(ReverbSize, ReverbSize.getValue());
onReverb(ReverbMix, ReverbMix.getValue());
onWidth(Width, Width.getValue());
onArpParam(ArpOn, ArpOn.getValue());
onArpParam(ArpRate, ArpRate.getValue());
onArpParam(ArpMode, ArpMode.getValue());
onArpParam(ArpOct, ArpOct.getValue());
onArpParam(ArpGate, ArpGate.getValue());
onArpParam(ArpSwing, ArpSwing.getValue());
onArpParam(ArpSteps, ArpSteps.getValue());
onXY(XYOn, XYOn.getValue());
onXY(XTarget, XTarget.getValue());
onXY(YTarget, YTarget.getValue());
onXY(XDepth, XDepth.getValue());
onXY(YDepth, YDepth.getValue());
onXY(XPos, XPos.getValue());
onXY(YPos, YPos.getValue());
applyOctaves();
applyEnvelope();
applyAll();
function onNoteOn()
{
	vis.hits = vis.hits + 1;

	if (ArpOn.getValue())
	{
		Message.ignoreEvent(true);
		arpNoteOn(Message.getNoteNumber(), Message.getVelocity());
	}
	else if (isHeld[Message.getNoteNumber()] == 1 || phys[Message.getNoteNumber()] == 1)
	{
		// leftover arp state from before the arp was switched off
		isHeld[Message.getNoteNumber()] = 0;
		phys[Message.getNoteNumber()] = 0;
		order.remove(Message.getNoteNumber());
	}
}
function onNoteOff()
{
	if (isHeld[Message.getNoteNumber()] == 1 || phys[Message.getNoteNumber()] == 1)
	{
		Message.ignoreEvent(true);
		arpNoteOff(Message.getNoteNumber());
	}
}
function onController()
{

}
function onTimer()
{
	if (ArpOn.getValue() && arp.running)
		arpTick();
	else
	{
		Synth.stopTimer();
		arp.running = 0;
		arp.display = -1;
	}
}
function onControl(number, value)
{

}
