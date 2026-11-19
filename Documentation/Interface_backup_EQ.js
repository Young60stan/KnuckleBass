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

const var envs = [Synth.getModulator("SubEnv"), Synth.getModulator("H2Env"),
                  Synth.getModulator("H3Env"),  Synth.getModulator("GritEnv")];
const var vels = [Synth.getModulator("SubVel"), Synth.getModulator("H2Vel"),
                  Synth.getModulator("H3Vel"),  Synth.getModulator("GritVel")];
const var synths = [SubOsc, Harm2Osc, Harm3Osc, GritOsc];

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

laf.registerFunction("drawRotarySlider", function(g, obj)
{
	var a = obj.area;
	var s = Math.min(a[2], a[3] - 18) - 10;
	var x = (a[2] - s) / 2;
	var y = 5;
	var cx = x + s / 2;
	var cy = y + s / 2;
	var start = -2.35;
	var range = 4.7;
	var end = start + range * obj.valueNormalized;
	var arcArea = [x - 3, y - 3, s + 6, s + 6];

	g.setColour(0xFF080D0F);
	g.fillEllipse([x, y, s, s]);

	var track = Content.createPath();
	track.startNewSubPath(0.0, 0.0);
	track.startNewSubPath(1.0, 1.0);
	track.addArc([0.0, 0.0, 1.0, 1.0], start, start + range);
	g.setColour(0xFF10262B);
	g.drawPath(track, arcArea, 3);

	if (obj.valueNormalized > 0.004)
	{
		var val = Content.createPath();
		val.startNewSubPath(0.0, 0.0);
		val.startNewSubPath(1.0, 1.0);
		val.addArc([0.0, 0.0, 1.0, 1.0], start, end);
		g.setColour(Colours.withAlpha(CYAN, 0.18));
		g.drawPath(val, arcArea, 8);
		g.setColour(CYAN);
		g.drawPath(val, arcArea, 2.5);
	}

	g.setGradientFill([0xFF222B30, cx, y + 6, 0xFF040607, cx, y + s - 6, false]);
	g.fillEllipse([x + 6, y + 6, s - 12, s - 12]);
	g.setColour(obj.hover ? CYAN : EDGE);
	g.drawEllipse([x + 6, y + 6, s - 12, s - 12], 1);

	var r1 = s / 2 - 10;
	var r2 = s / 2 - 20;
	g.setColour(CYAN);
	g.drawLine(cx + Math.sin(end) * r2, cx + Math.sin(end) * r1,
	           cy - Math.cos(end) * r2, cy - Math.cos(end) * r1, 2.5);

	g.setFont("Oxygen Bold", 11);
	g.setColour(obj.hover ? CYAN : TEXT_DIM);
	g.drawAlignedText(obj.text, [0, a[3] - 16, a[2], 14], "centred");
});

laf.registerFunction("drawToggleButton", function(g, obj)
{
	var a = obj.area;
	var on = obj.value;
	g.setColour(on ? CYAN_DARK : 0xFF0A1012);
	g.fillRoundedRectangle([0.5, 0.5, a[2] - 1, a[3] - 1], 4);
	g.setColour(on ? CYAN : (obj.over ? 0xFF2E5A62 : 0xFF1E3A40));
	g.drawRoundedRectangle([0.5, 0.5, a[2] - 1, a[3] - 1], 4, 1);
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
pnlMain.data.boxes = [[20, 10, 300, 170, "SUB OSC"], [20, 190, 300, 170, "HARMONICS"],
                      [20, 370, 300, 188, "GRIT LAYER"], [340, 420, 320, 138, "MASTER"],
                      [680, 10, 300, 548, "AMP ENVELOPE"]];

const var SubLevel = makeKnob("SubLevel", "pnlMain", 40,  52, "LEVEL",  0, 1, -1, 0.01, 0.85);
const var SubOct   = makeKnob("SubOct",   "pnlMain", 136, 52, "OCTAVE", -2, 1, -1, 1, 0);
const var SubDrive = makeKnob("SubDrive", "pnlMain", 232, 52, "WARMTH", 0, 1, -1, 0.01, 0.15);

const var Harm2 = makeKnob("Harm2", "pnlMain", 40,  232, "2ND",   0, 1, -1, 0.01, 0.30);
const var Harm3 = makeKnob("Harm3", "pnlMain", 136, 232, "3RD",   0, 1, -1, 0.01, 0.12);

const var GritLevel = makeKnob("GritLevel", "pnlMain", 40,  410, "LEVEL",  0, 1, -1, 0.01, 0.08);
const var GritOct   = makeKnob("GritOct",   "pnlMain", 136, 410, "OCTAVE", -1, 2, -1, 1, 0);
const var capGritWave = makeCaption("capGritWave", "pnlMain", 220, 418, 90, "WAVE");
const var GritWave  = makeCombo("GritWave", "pnlMain", 220, 438, 86, WAVE_NAMES, 1);

const var pnlWoofer = makePanel("pnlWoofer", "pnlMain", 340, 0, 320, 410);

const var Volume   = makeKnob("Volume",   "pnlMain", 362, 462, "VOLUME",   -24, 6, -1, 0.1, -3);
const var VelSens  = makeKnob("VelSens",  "pnlMain", 448, 462, "VELOCITY", 0, 1, -1, 0.01, 0.3);
const var MonoBtn  = makeButton("MonoBtn", "pnlMain", 546, 488, 92, 28, "MONO", 1, true);

const var pnlEnv  = makePanel("pnlEnv", "pnlMain", 700, 48, 260, 150);
const var Attack  = makeKnob("Attack",  "pnlMain", 712, 230, "ATTACK",  1, 2000, 100, 1, 3);
const var Decay   = makeKnob("Decay",   "pnlMain", 802, 230, "DECAY",   5, 5000, 400, 1, 450);
const var Sustain = makeKnob("Sustain", "pnlMain", 712, 330, "SUSTAIN", 0, 100, -1, 1, 85);
const var Release = makeKnob("Release", "pnlMain", 802, 330, "RELEASE", 5, 5000, 400, 1, 180);

// ---- EFFECTS ----
pnlFX.data.boxes = [[20, 10, 306, 176, "FILTER"],     [347, 10, 306, 176, "POLYSHAPE"],  [674, 10, 306, 176, "SATURATOR"],
                    [20, 196, 306, 176, "COMPRESSOR"], [347, 196, 306, 176, "LIMITER"],   [674, 196, 306, 176, "CHORUS"],
                    [20, 382, 306, 176, "DELAY"],      [347, 382, 306, 176, "REVERB"],    [674, 382, 306, 176, "STEREO"]];

const var FilterOn   = makeButton("FilterOn", "pnlFX", 254, 18, 60, 22, "ON", 1, true);
const var Cutoff     = makeKnob("Cutoff",    "pnlFX", 36,  52, "CUTOFF", 20, 20000, 1000, 1, 2500);
const var Resonance  = makeKnob("Resonance", "pnlFX", 108, 52, "RESO",   0.3, 9.9, -1, 0.01, 1.0);
const var capFilterMode = makeCaption("capFilterMode", "pnlFX", 190, 64, 120, "MODE");
const var FilterMode = makeCombo("FilterMode", "pnlFX", 190, 84, 120, FILTER_NAMES, 1);

const var ShapeOn    = makeButton("ShapeOn", "pnlFX", 581, 18, 60, 22, "ON", 1, true);
const var ShapeDrive = makeKnob("ShapeDrive", "pnlFX", 363, 52, "DRIVE", 0, 24, -1, 0.1, 3);
const var capShapeMode = makeCaption("capShapeMode", "pnlFX", 450, 64, 120, "SHAPE");
const var ShapeMode  = makeCombo("ShapeMode", "pnlFX", 450, 84, 130, SHAPE_NAMES, 2);

const var SatOn      = makeButton("SatOn", "pnlFX", 908, 18, 60, 22, "ON", 1, true);
const var SatAmount  = makeKnob("SatAmount", "pnlFX", 690, 52, "AMOUNT", 0, 0.95, -1, 0.01, 0.3);
const var SatMix     = makeKnob("SatMix",    "pnlFX", 762, 52, "MIX",    0, 1, -1, 0.01, 0.5);

const var CompOn      = makeButton("CompOn", "pnlFX", 254, 204, 60, 22, "ON", 1, true);
const var CompThresh  = makeKnob("CompThresh",  "pnlFX", 36,  238, "THRESH",  -40, 0, -1, 0.1, -12);
const var CompRatio   = makeKnob("CompRatio",   "pnlFX", 106, 238, "RATIO",   1, 20, 4, 0.1, 4);
const var CompAttack  = makeKnob("CompAttack",  "pnlFX", 176, 238, "ATTACK",  0.1, 100, 10, 0.1, 10);
const var CompRelease = makeKnob("CompRelease", "pnlFX", 246, 238, "RELEASE", 10, 1000, 150, 1, 120);

const var LimOn      = makeButton("LimOn", "pnlFX", 581, 204, 60, 22, "ON", 1, true);
const var LimCeiling = makeKnob("LimCeiling", "pnlFX", 363, 238, "CEILING", -24, 0, -1, 0.1, -1);
const var LimRelease = makeKnob("LimRelease", "pnlFX", 435, 238, "RELEASE", 10, 500, 80, 1, 60);

const var ChorusOn    = makeButton("ChorusOn", "pnlFX", 908, 204, 60, 22, "ON", 0, true);
const var ChorusRate  = makeKnob("ChorusRate",  "pnlFX", 690, 238, "RATE",  0, 1, -1, 0.01, 0.3);
const var ChorusDepth = makeKnob("ChorusDepth", "pnlFX", 762, 238, "DEPTH", 0, 1, -1, 0.01, 0.4);

const var DelayOn       = makeButton("DelayOn", "pnlFX", 254, 390, 60, 22, "ON", 0, true);
const var DelayTime     = makeKnob("DelayTime",     "pnlFX", 36,  424, "TIME",     10, 1000, 250, 1, 375);
const var DelayFeedback = makeKnob("DelayFeedback", "pnlFX", 108, 424, "FEEDBACK", 0, 0.95, -1, 0.01, 0.3);
const var DelayMix      = makeKnob("DelayMix",      "pnlFX", 180, 424, "MIX",      0, 1, -1, 0.01, 0.2);

const var ReverbOn   = makeButton("ReverbOn", "pnlFX", 581, 390, 60, 22, "ON", 0, true);
const var ReverbSize = makeKnob("ReverbSize", "pnlFX", 363, 424, "SIZE", 0, 1, -1, 0.01, 0.5);
const var ReverbMix  = makeKnob("ReverbMix",  "pnlFX", 435, 424, "MIX",  0, 1, -1, 0.01, 0.15);

const var Width = makeKnob("Width", "pnlFX", 690, 424, "WIDTH", 0, 200, -1, 1, 100);

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
	sp.set("bgColour", 0xFF05090A);
	sp.set("itemColour", CYAN);
	sp.set("itemColour2", 0x3300E5FF);
	sp.set("textColour", TEXT);
	sp.set("showValueOverlay", true);
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
pnlEQ.data.boxes = [[20, 10, 960, 380, "EQUALIZER"], [20, 400, 960, 158, "SELECTED BAND"]];

const var EqOn = makeButton("EqOn", "pnlEQ", 896, 17, 70, 22, "ON", 1, false);

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

const var capEqBands = makeCaption("capEqBands", "pnlEQ", 40, 432, 200, "BAND");
const var eqBandBtns = [];
for (i = 0; i < EQ_MAX_BANDS; i++)
{
	eqBandBtns.push(makeButton("EqBand" + (i + 1), "pnlEQ", 40 + i * 41, 452, 37, 30, "" + (i + 1), i == 0 ? 1 : 0, false));
	eqBandBtns[i].setLocalLookAndFeel(tabLaf);
}

const var EqGain = makeKnob("EqGain", "pnlEQ", 390, 428, "GAIN", -18, 18, -1, 0.1, 0);
const var EqFreq = makeKnob("EqFreq", "pnlEQ", 470, 428, "FREQ", 20, 20000, 1000, 1, 1000);
const var EqQ    = makeKnob("EqQ",    "pnlEQ", 550, 428, "Q",    0.3, 8, 1.0, 0.01, 1.0);
const var capEqType = makeCaption("capEqType", "pnlEQ", 640, 432, 140, "TYPE");
const var EqType = makeCombo("EqType", "pnlEQ", 640, 452, 140, EQ_TYPES, 5);
const var EqBandOn = makeButton("EqBandOn", "pnlEQ", 798, 452, 80, 30, "BAND ON", 1, false);
const var EqReset  = makeButton("EqReset",  "pnlEQ", 886, 452, 80, 30, "RESET", 0, false);
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
	for (i = 0; i < 16; i++)
	{
		stepVel[i]   = ArpVel.getSliderValueAt(i);
		stepPitch[i] = ArpPitch.getSliderValueAt(i);
		stepGate[i]  = ArpGateLane.getSliderValueAt(i);
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
	else if (component == ArpSteps) show("ARP STEPS", fmt(value, 0));
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
pnlBg.setPaintRoutine(function(g)
{
	g.fillAll(0xFF000000);

	// faint grid
	g.setColour(0x0A00E5FF);
	for (i = 0; i < 1000; i += 40) g.fillRect([i, 64, 1, 584]);
	for (i = 64; i < 648; i += 40) g.fillRect([0, i, 1000, 1]);

	// header
	g.setGradientFill([0xFF061012, 0, 0, 0xFF000000, 0, 64, false]);
	g.fillRect([0, 0, 1000, 64]);
	g.setColour(Colours.withAlpha(CYAN, 0.5));
	g.fillRect([0, 63, 1000, 1]);

	g.setFont("Oxygen Bold", 26);
	g.setColour(0xFFFFFFFF);
	g.drawAlignedText("KNUCKLE", [24, 14, 120, 36], "left");
	g.setColour(CYAN);
	g.drawAlignedText("BASS", [139, 14, 80, 36], "left");
	g.setFont("Oxygen", 10);
	g.setColour(TEXT_DIM);
	g.drawAlignedText("SUB  SYNTH", [208, 26, 90, 16], "left");

	// footer
	g.setColour(Colours.withAlpha(CYAN, 0.3));
	g.fillRect([0, 646, 1000, 1]);
	g.setFont("Oxygen", 11);
	g.setColour(TEXT_DIM);
	g.drawAlignedText("KNUCKLEBASS  v1.0", [700, 652, 280, 22], "right");
});

inline function paintBoxes(g, boxes)
{
	for (b in boxes)
	{
		g.setColour(0xE0050809);
		g.fillRoundedRectangle([b[0], b[1], b[2], b[3]], 6);
		g.setColour(EDGE);
		g.drawRoundedRectangle([b[0] + 0.5, b[1] + 0.5, b[2] - 1, b[3] - 1], 6, 1);
		g.setColour(CYAN);
		g.fillRect([b[0] + 14, b[1] + 13, 3, 12]);
		g.setFont("Oxygen Bold", 13);
		g.setColour(0xFFE6FDFF);
		g.drawAlignedText(b[4], [b[0] + 24, b[1] + 9, b[2] - 100, 20], "left");
	}
}

const var pagePaint = function(g) { paintBoxes(g, this.data.boxes); };
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
	g.setColour(this.data.hover ? 0xFF0A1A1D : 0xFF060B0C);
	g.fillRoundedRectangle([0.5, 0.5, this.getWidth() - 1, this.getHeight() - 1], 4);
	g.setColour(this.data.hover ? CYAN : EDGE);
	g.drawRoundedRectangle([0.5, 0.5, this.getWidth() - 1, this.getHeight() - 1], 4, 1);
	g.setFont("Oxygen Bold", 12);
	g.setColour(TEXT);
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
pnlWoofer.loadImage("{PROJECT_FOLDER}woofer_frame.png", "frame");
pnlWoofer.loadImage("{PROJECT_FOLDER}woofer_cone.png", "cone");
pnlWoofer.data.pulse = 0.0;
pnlWoofer.data.phase = 0.0;
pnlWoofer.data.lastHits = 0;
pnlWoofer.data.rings = [];
pnlWoofer.data.tick = 0;

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
	g.setGradientFill([Colours.withAlpha(CYAN, 0.10 + 0.35 * p), cx, cy, 0x0000E5FF, cx, cy + gs, true]);
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
	var cs = size * 0.875 * (0.985 + 0.075 * (p + wobble * 0.3));
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

	if (pnlArp.get("visible")) pnlStepView.repaint();
	if (this.data.tick % 15 == 0) pnlPresetName.repaint();
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
	for (i = 0; i < 16; i++)
	{
		var c = 0xFF0A1416;
		if (i >= steps) c = 0xFF040506;
		if (i == arp.display && ArpOn.getValue()) c = CYAN;
		g.setColour(c);
		g.fillRoundedRectangle([i * cw + 2, 1, cw - 4, h - 2], 2);
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
