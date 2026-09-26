// ─── MetaMuse Chord Keys (MIDI Effect) ──────────────────────────────────────
//
// Play one key, hear a full chord in your chosen key and mode.
//
//   White Keys mode: the white keys always play the scale's chords in order,
//                    whatever key you pick: C = I, D = ii, E = iii, F = IV...
//                    (black keys are ignored).
//   Snap mode:       any key plays the chord built on the nearest scale note
//                    at or below it.
//
// Patch wiring (see build_devices.py):
//   inlet 0  : raw MIDI bytes from [midiin] (ints) and UI messages
//   outlet 0 : raw MIDI bytes -> [midiout]
//   outlet 1 : UI feedback -> [route readout]

inlets = 1;
outlets = 2;

// Order must match the menus in build_devices.py.
var MAPPINGS = ["White Keys", "Snap"];
var STRUM_DIRS = ["Up", "Down"];
var WHITE_KEYS = [0, 2, 4, 5, 7, 9, 11];  // C D E F G A B -> degrees 1-7

var state = {
    root: 0,
    scale: 0,
    mapping: 0,
    type: 0,
    octShift: 0,
    inversion: 0,
    bass: 0,
    voiceLead: 1,
    strum: 0,          // ms between notes
    strumDir: 0
};

// ─── CHORD FOR A KEY (pure logic, testable in Node) ─────────────────────────

// Which scale degree and root pitch an incoming key plays, or null to ignore.
function keyToChordRoot(st, pitch) {
    var intervals = SCALES[st.scale][1];
    var len = intervals.length;
    var octave = Math.floor(pitch / 12);   // MIDI octave of the key pressed

    if (MAPPINGS[st.mapping] === "White Keys") {
        var white = WHITE_KEYS.indexOf(pitch % 12);
        if (white < 0) return null;
        var degIdx = white % len;
        var extraOct = Math.floor(white / len);   // short scales wrap upwards
        return {
            degIdx: degIdx,
            rootMidi: (octave + extraOct + st.octShift) * 12 + st.root + intervals[degIdx]
        };
    }

    // Snap: the scale note at or below the key pressed.
    var rel = ((pitch - st.root) % 12 + 12) % 12;
    var deg = 0;
    for (var i = 0; i < len; i++) if (intervals[i] <= rel) deg = i;
    return { degIdx: deg, rootMidi: pitch - (rel - intervals[deg]) + st.octShift * 12 };
}

// The notes (low to high) and name of the chord for one key press.
function chordForKey(st, pitch, prevVoicing) {
    var r = keyToChordRoot(st, pitch);
    if (!r) return null;
    var intervals = SCALES[st.scale][1];
    var shape = chordShape(intervals, r.degIdx, st.type);
    var upper = shape.map(function (s) { return r.rootMidi + s; });
    for (var i = 0; i < st.inversion % upper.length; i++) upper.push(upper.shift() + 12);
    if (st.voiceLead && prevVoicing && prevVoicing.length) {
        upper = smoothestVoicing(prevVoicing, upper, mean(upper));
    }
    var all = upper.slice();
    if (st.bass) all.push(r.rootMidi - 12);
    return {
        upper: upper,
        pitches: ascending(all).filter(function (p) { return p >= 0 && p <= 127; }),
        name: romanFor(r.degIdx, shape) + "  " + chordName((st.root + intervals[r.degIdx]) % 12, shape, CHORD_TYPES[st.type])
    };
}

// ─── LIVE PLAYING ────────────────────────────────────────────────────────────

var lastVoicing = null;
var held = {};       // input pitch -> { sent: [pitches], pending: [Task] }
var soundCount = {}; // output pitch -> how many held keys are sounding it

function send(status, data1, data2) {
    outlet(0, status);
    outlet(0, data1);
    outlet(0, data2);
}

function playOn(channel, pitch, vel) {
    var chord = chordForKey(state, pitch, lastVoicing);
    if (!chord) return;
    lastVoicing = chord.upper;
    outlet(1, "readout", "set", chord.name);

    var order = STRUM_DIRS[state.strumDir] === "Down" ? chord.pitches.slice().reverse() : chord.pitches;
    var entry = { sent: [], pending: [] };
    held[pitch] = entry;
    order.forEach(function (p, k) {
        var start = function () {
            soundCount[p] = (soundCount[p] || 0) + 1;
            entry.sent.push(p);
            send(0x90 | channel, p, vel);
        };
        if (state.strum > 0 && k > 0 && typeof Task !== "undefined") {
            var task = new Task(start);
            entry.pending.push(task);
            task.schedule(state.strum * k);
        } else {
            start();
        }
    });
}

function playOff(channel, pitch) {
    var entry = held[pitch];
    if (!entry) return;
    delete held[pitch];
    entry.pending.forEach(function (t) { t.cancel(); });
    entry.sent.forEach(function (p) {
        soundCount[p] -= 1;
        if (soundCount[p] <= 0) {
            delete soundCount[p];
            send(0x80 | channel, p, 0);
        }
    });
}

// ─── MIDI BYTE PARSER ────────────────────────────────────────────────────────
// [midiin] delivers raw bytes. Note on/off become chords; everything else
// (CCs, pitch bend, sysex, clock...) passes straight through.

var status = 0, data = [], inSysex = false;

function dataLength(st) {
    var type = st & 0xF0;
    if (type === 0xC0 || type === 0xD0) return 1;
    if (st === 0xF1 || st === 0xF3) return 1;
    if (st === 0xF2) return 2;
    if (st >= 0xF4) return 0;
    return 2;
}

function msg_int(b) {
    if (b >= 0xF8) { outlet(0, b); return; }                 // realtime: pass through
    if (b === 0xF0) { inSysex = true; outlet(0, b); return; }
    if (inSysex) { outlet(0, b); if (b === 0xF7) inSysex = false; return; }
    if (b >= 0x80) {
        status = b; data = [];
        if (dataLength(b) === 0) outlet(0, b);
        return;
    }
    if (!status) return;
    data.push(b);
    if (data.length < dataLength(status)) return;

    var type = status & 0xF0, channel = status & 0x0F;
    if (type === 0x90 && data[1] > 0) playOn(channel, data[0], data[1]);
    else if (type === 0x80 || type === 0x90) playOff(channel, data[0]);
    else { outlet(0, status); data.forEach(function (d) { outlet(0, d); }); }
    data = [];   // keep status for running status
}

// ─── UI ──────────────────────────────────────────────────────────────────────

function idleText() {
    return NOTES[state.root] + " " + SCALES[state.scale][0] +
        (MAPPINGS[state.mapping] === "White Keys" ? " · white keys: C=I D=ii E=iii F=IV G=V A=vi B=vii" : " · play any key");
}

function changed() {
    lastVoicing = null;
    outlet(1, "readout", "set", idleText());
}

function root(v)      { state.root = v | 0; changed(); }
function scale(v)     { state.scale = v | 0; changed(); }
function mapping(v)   { state.mapping = v | 0; changed(); }
function type(v)      { state.type = v | 0; changed(); }
function octshift(v)  { state.octShift = v | 0; changed(); }
function inversion(v) { state.inversion = v | 0; changed(); }
function bass(v)      { state.bass = v ? 1 : 0; changed(); }
function voicelead(v) { state.voiceLead = v ? 1 : 0; changed(); }
function strum(v)     { state.strum = Math.max(0, v | 0); }
function strumdir(v)  { state.strumDir = v | 0; }

function loaded() { changed(); }
