// ─── Keywise Bass / Keywise Melody (MIDI Generators) ────────────────────────
//
// Writes a bassline or a melody that follows a chord progression. The chords
// come from the "From" menu:
//   Trk/Slot:   a Session View clip, picked by track number and slot number
//               (counting down from the top). Its chords are looped to fill
//               this clip's time selection. Use an empty clip.
//   This Clip:  the chords already in this clip, which get replaced.
// The same script runs both devices; the patch passes "bass" or "melody":
//   [js keywise_lines.js bass]
//
// Patch wiring (see build_devices.py):
//   inlet 0  : UI messages and the notes dictionary from live.miditool.in
//   inlet 1  : context dictionary from live.miditool.in
//   outlet 0 : "dictionary <name>" -> live.miditool.out
//   outlet 1 : bang -> live.miditool.in (re-apply when a control changes)
//   outlet 2 : UI feedback -> [route readout]

inlets = 2;
outlets = 3;

var MODE = (typeof jsarguments !== "undefined" && jsarguments[1]) ? String(jsarguments[1]) : "bass";

// Order must match the menus in build_devices.py.
var BASS_PATTERNS = ["Held", "Pulse", "Root-Fifth", "Octaves", "Walking", "Syncopated", "Push"];
var BASS_RATES = [1, 1 / 2, 1 / 4, 1 / 3];            // 1/4, 1/8, 1/16, 1/8T in beats
var MELODY_RHYTHMS = ["Quarters", "8ths", "16ths", "Mixed"];
var SOURCES = ["Trk/Slot", "This Clip"];
var BASS_FILLS = ["No Fill", "Walk-up", "Run Down", "Octaves", "Push", "Drop Out"];
var MELODY_FILLS = ["No Fill", "Run Up", "Run Down", "Pickup", "Long Note", "Rest"];

var state = {
    // bass
    pattern: 1,
    rate: 1,
    bassOctave: 1,     // Live naming: C1 = MIDI 36
    gate: 90,          // % of each step the note lasts
    // melody
    rhythm: 1,
    density: 60,       // % chance of a note on each weak step
    melodyOctave: 4,   // C4 = MIDI 72
    variation: 1,      // seed: change it for a different melody
    repeat: 1,         // reuse one bar of rhythm so the melody has a motif
    // both
    source: 0,         // index into SOURCES
    track: 1,          // Trk/Slot: track number, as shown in Live (1 = first track)
    slot: 1,           // Trk/Slot: clip slot, counting down from the top
    fillType: 0,       // index into BASS_FILLS / MELODY_FILLS
    fillEvery: 0,      // index into FILL_EVERY (theory.js)
    velocity: 100
};

var context = null;
var ready = 0;

// ─── CHORD DETECTION ─────────────────────────────────────────────────────────
// Notes that start within 1/4 beat of each other belong to the same chord
// (so strummed chords still count as one). Each chord lasts until the next
// one starts. Works best on block or strummed chords, not arpeggios.

var TOGETHER = 0.25;

function detectChords(notes) {
    var list = notes.filter(function (n) { return !n.mute; })
                    .sort(function (a, b) { return a.start_time - b.start_time; });
    var groups = [];
    list.forEach(function (n) {
        var g = groups[groups.length - 1];
        if (g && n.start_time - g.start < TOGETHER) g.notes.push(n);
        else groups.push({ start: n.start_time, notes: [n] });
    });

    return groups.map(function (g, i) {
        var lastEnd = 0;
        g.notes.forEach(function (n) { lastEnd = Math.max(lastEnd, n.start_time + n.duration); });
        var end = i + 1 < groups.length ? groups[i + 1].start : lastEnd;
        var pitches = ascending(g.notes.map(function (n) { return n.pitch; }));
        var info = chordRoot(pitches);
        return {
            start: g.start,
            end: end,
            pitches: pitches,
            pcs: info.pcs,
            root: info.root,          // pitch class 0-11
            third: info.third,        // 3 or 4 semitones (or null)
            fifth: info.fifth,        // usually 7
            name: info.name
        };
    });
}

// Work out the root of a chord, even when it's in an inversion: the root is
// the note that has a 5th and a 3rd above it among the chord's notes.
function chordRoot(pitches) {
    var pcs = [];
    pitches.forEach(function (p) { if (pcs.indexOf(p % 12) < 0) pcs.push(p % 12); });
    var lowest = pitches[0] % 12;
    var best = lowest, bestScore = -1;
    pcs.forEach(function (r) {
        var has = function (iv) { return pcs.indexOf((r + iv) % 12) >= 0; };
        // A perfect 5th is the strongest clue. A b5 (diminished) counts a
        // little; a #5 barely, since B-D-G is far more often G/B than B+.
        var score = (has(7) ? 3 : has(6) ? 1 : has(8) ? 0.5 : 0) +
                    (has(3) || has(4) ? 2 : 0) +
                    (has(10) || has(11) ? 1 : 0) +
                    (r === lowest ? 1 : 0);
        if (score > bestScore) { bestScore = score; best = r; }
    });
    var has = function (iv) { return pcs.indexOf((best + iv) % 12) >= 0; };
    var third = has(4) ? 4 : has(3) ? 3 : null;
    var fifth = has(7) ? 7 : has(6) ? 6 : has(8) ? 8 : 7;
    var shape = [0];
    if (third) shape.push(third);
    shape.push(fifth);
    var suffix = shape.length === 3 ? qualityName(shape) : "5";
    return { pcs: pcs, root: best, third: third, fifth: fifth, name: NOTES[best] + (suffix || "") };
}

// The scale to use for passing notes: the clip's Scale if it has one,
// otherwise every note that appears in the chords.
function scaleFor(chords, ctx) {
    if (ctx && ctx.scale && ctx.scale.scale_intervals && ctx.scale.scale_intervals.length) {
        var r = ctx.scale.root_note || 0;
        return ctx.scale.scale_intervals.map(function (iv) { return (r + iv) % 12; });
    }
    var pcs = [];
    chords.forEach(function (c) {
        c.pcs.forEach(function (pc) { if (pcs.indexOf(pc) < 0) pcs.push(pc); });
    });
    return pcs;
}

// Nearest pitch at or near `target` whose pitch class is in `pcs`.
function nearestIn(pcs, target) {
    for (var d = 0; d < 12; d++) {
        if (pcs.indexOf(((target - d) % 12 + 12) % 12) >= 0) return target - d;
        if (pcs.indexOf((target + d) % 12) >= 0) return target + d;
    }
    return target;
}

// Next note of the scale going up (dir 1) or down (dir -1) from pitch.
function scaleStep(pcs, pitch, dir) {
    var p = pitch;
    for (var i = 0; i < 12; i++) {
        p += dir;
        if (pcs.indexOf(((p % 12) + 12) % 12) >= 0) return p;
    }
    return pitch + dir;
}

// ─── BASS ────────────────────────────────────────────────────────────────────

function bassLine(st, chords, scalePcs) {
    var notes = [];
    var pattern = BASS_PATTERNS[st.pattern];
    var step = BASS_RATES[st.rate];
    var gate = st.gate / 100;
    function add(pitch, start, len) {
        if (len <= 0.001 || pitch < 0 || pitch > 127) return;
        notes.push({ pitch: pitch, start_time: start, duration: len, velocity: st.velocity, mute: 0 });
    }

    chords.forEach(function (c, ci) {
        var root = (st.bassOctave + 2) * 12 + c.root;
        var fifth = root + c.fifth;
        var dur = c.end - c.start;
        var next = chords[ci + 1];
        var nextRoot = next ? (st.bassOctave + 2) * 12 + next.root : root;
        var steps = Math.max(1, Math.round(dur / step));

        if (pattern === "Held") {
            add(root, c.start, dur * gate);
        } else if (pattern === "Pulse" || pattern === "Root-Fifth" || pattern === "Octaves") {
            for (var s = 0; s < steps; s++) {
                var p = root;
                if (pattern === "Root-Fifth" && s % 2) p = fifth;
                if (pattern === "Octaves" && s % 2) p = root + 12;
                add(p, c.start + s * step, Math.min(step * gate, c.end - (c.start + s * step)));
            }
        } else if (pattern === "Walking") {
            // One note per step: root, then chord/scale tones, and the last
            // step walks a half step into the next chord's root.
            var line = [root];
            var tones = [root + (c.third || 4), fifth, root + 12];
            for (var w = 1; w < steps; w++) {
                if (w === steps - 1 && next) {
                    line.push(nextRoot + (nextRoot > line[w - 1] ? -1 : 1));
                } else {
                    line.push(w % 2 ? tones[(w - 1) % tones.length] :
                        scaleStep(scalePcs, line[w - 1], line[w - 1] < root + 7 ? 1 : -1));
                }
            }
            line.forEach(function (p, k) { add(p, c.start + k * step, Math.min(step * gate, c.end - (c.start + k * step))); });
        } else if (pattern === "Syncopated") {
            // 3 + 3 + 2 steps (the "tresillo"), repeated through the chord.
            var cell = [[0, 3, root], [3, 3, root], [6, 2, fifth]];
            for (var bar = 0; bar * 8 < steps; bar++) {
                cell.forEach(function (h) {
                    var at = bar * 8 + h[0];
                    if (at < steps) add(h[2], c.start + at * step, Math.min(h[1] * step * gate, c.end - (c.start + at * step)));
                });
            }
        } else if (pattern === "Push") {
            // Hold the root, then hit the next chord's root one step early.
            if (next && dur > step) {
                add(root, c.start, (dur - step) * gate);
                add(nextRoot, c.end - step, step * gate);
            } else {
                add(root, c.start, dur * gate);
            }
        }
    });
    return notes;
}

// ─── MELODY ──────────────────────────────────────────────────────────────────
// A rhythm is made for one bar (reused every bar when Repeat Motif is on).
// Notes on the beat land on chord tones; notes between beats move by scale
// steps. The line wanders up and down but is pulled back towards its centre.

function melodyRhythm(st, rand) {
    var kind = MELODY_RHYTHMS[st.rhythm];
    var onsets = [];
    for (var beat = 0; beat < 4; beat++) {
        var div = kind === "Quarters" ? 1 : kind === "8ths" ? 2 : kind === "16ths" ? 4 :
                  [1, 2, 2, 4][Math.floor(rand() * 4)];
        for (var k = 0; k < div; k++) {
            var onBeat = k === 0;
            var chance = (st.density / 100) + (onBeat ? 0.25 : 0);
            if ((beat === 0 && onBeat) || rand() < chance) onsets.push(beat + k / div);
        }
    }
    return onsets;
}

function melodyLine(st, chords, scalePcs) {
    var notes = [];
    if (!chords.length) return notes;
    var start = chords[0].start, end = chords[chords.length - 1].end;
    var centre = (st.melodyOctave + 2) * 12 + 4;
    var dirRand = seededRandom(st.variation * 7 + 3);
    var pitch = centre;
    var dir = 1;

    for (var bar = 0; start + bar * 4 < end - 1e-6; bar++) {
        var barStart = start + bar * 4;
        var rhythmSeed = st.repeat ? st.variation : st.variation * 100 + bar;
        var onsets = melodyRhythm(st, seededRandom(rhythmSeed));
        for (var i = 0; i < onsets.length; i++) {
            var t = barStart + onsets[i];
            if (t >= end - 1e-6) break;
            var nextT = i + 1 < onsets.length ? barStart + onsets[i + 1] : barStart + 4;
            var chord = chordAt(chords, t);
            if (!chord) continue;

            // Change direction now and then, and always when far from centre.
            if (dirRand() < 0.3) dir = -dir;
            if (pitch > centre + 7) dir = -1;
            if (pitch < centre - 7) dir = 1;

            var onBeat = Math.abs(onsets[i] - Math.round(onsets[i])) < 1e-6;
            if (onBeat) {
                pitch = nearestIn(chord.pcs, pitch + dir * 2);
            } else {
                pitch = scaleStep(scalePcs, pitch, dir);
                if (dirRand() < 0.25) pitch = scaleStep(scalePcs, pitch, dir);  // occasional skip
            }
            var len = Math.min(nextT, end, chord.end) - t;
            if (len > 0.01) {
                notes.push({ pitch: pitch, start_time: t, duration: len * 0.95,
                             velocity: onBeat ? st.velocity : Math.round(st.velocity * 0.85), mute: 0 });
            }
        }
    }
    return notes;
}

function chordAt(chords, t) {
    for (var i = 0; i < chords.length; i++) {
        if (t >= chords[i].start - 1e-6 && t < chords[i].end - 1e-6) return chords[i];
    }
    return null;
}

// ─── FILLS ───────────────────────────────────────────────────────────────────
// A fill replaces the last 2 beats before each phrase end P (see fillPoints
// in theory.js) and leads into the chord at P, or back to the first chord
// at the very end.
//   Bass:   Walk-up / Run Down  four 8ths stepping through the scale into the next root
//           Octaves             the root bouncing between octaves
//           Push                the next root arrives an 8th early
//           Drop Out            silence
//   Melody: Run Up / Run Down   a 16th-note scale run into the next chord
//           Pickup              two 8ths leading into the downbeat
//           Long Note           one held chord tone
//           Rest                silence

var FILL_BEATS = 2;

// Remove notes starting in [a, b); shorten notes that ring on into it.
function cutNotes(notes, a, b) {
    return notes.filter(function (n) {
        return n.start_time < a - 1e-6 || n.start_time >= b - 1e-6;
    }).map(function (n) {
        if (n.start_time < a - 1e-6 && n.start_time + n.duration > a) {
            n.duration = a - n.start_time;
        }
        return n;
    });
}

// `count` scale steps from pitch, going in direction dir (1 up, -1 down),
// returned in the order they are passed: [1 step, 2 steps, ...].
function scaleSteps(pcs, pitch, dir, count) {
    var out = [];
    for (var i = 0; i < count; i++) out.push(pitch = scaleStep(pcs, pitch, dir));
    return out;
}

function lineFills(st, notes, chords, scalePcs, info) {
    var fills = MODE === "melody" ? MELODY_FILLS : BASS_FILLS;
    var fill = fills[st.fillType];
    if (!fill || fill === "No Fill" || !chords.length) return notes;

    fillPoints(st.fillEvery, info.start, info.end, info.passLength, FILL_BEATS).forEach(function (p) {
        var a = p - FILL_BEATS;
        // The chord the fill leads into: one starting at p (allowing for loose
        // timing), back to the first chord at the end of the clip, otherwise
        // whatever is sounding at p.
        var startsAtP = chords.filter(function (c) { return Math.abs(c.start - p) < TOGETHER; })[0];
        var next = startsAtP || (p >= info.end - 1e-6 ? chords[0] : chordAt(chords, p)) || chords[0];
        var current = chordAt(chords, a) || next;
        var add = function (pitch, t, dur) {
            if (pitch >= 0 && pitch <= 127) {
                notes.push({ pitch: pitch, start_time: t, duration: dur, velocity: st.velocity, mute: 0 });
            }
        };

        if (MODE !== "melody") {
            var base = (st.bassOctave + 2) * 12;
            var nextRoot = base + next.root, root = base + current.root;
            var gate = st.gate / 100;
            if (fill === "Push") {
                notes = cutNotes(notes, p - 0.5, p);
                add(nextRoot, p - 0.5, 0.5 * gate);
                return;
            }
            notes = cutNotes(notes, a, p);
            var run = fill === "Walk-up" ? scaleSteps(scalePcs, nextRoot, -1, 4).reverse() :
                      fill === "Run Down" ? scaleSteps(scalePcs, nextRoot, 1, 4).reverse() :
                      fill === "Octaves" ? [root + 12, root, root + 12, root] : [];
            run.forEach(function (pitch, k) { add(pitch, a + k * 0.5, 0.5 * gate); });
            return;
        }

        // Melody: aim for the chord tone of the next chord nearest the last note played.
        var last = null;
        notes.forEach(function (n) { if (n.start_time < a - 1e-6) last = n; });
        var from = last ? last.pitch : (st.melodyOctave + 2) * 12 + 4;
        var target = nearestIn(next.pcs, from);
        notes = cutNotes(notes, a, p);
        if (fill === "Run Up" || fill === "Run Down") {
            scaleSteps(scalePcs, target, fill === "Run Up" ? -1 : 1, 8).reverse()
                .forEach(function (pitch, k) { add(pitch, a + k * 0.25, 0.24); });
        } else if (fill === "Pickup") {
            scaleSteps(scalePcs, target, -1, 2).reverse()
                .forEach(function (pitch, k) { add(pitch, a + 1 + k * 0.5, 0.45); });
        } else if (fill === "Long Note") {
            add(nearestIn(current.pcs, from), a, FILL_BEATS * 0.95);
        }
    });
    return notes.sort(function (x, y) { return x.start_time - y.start_time; });
}

// ─── BOTH ────────────────────────────────────────────────────────────────────

var lastChords = [];
var lastSource = "";   // e.g. 'Track 1 "Chords", slot 2'
var lastError = "";

// Read the MIDI notes of a Session View clip through the Live API.
// track and slot count from 1, as shown in Live. Returns
// { notes, start, length, label } or { error }.
function readSessionClip(track, slot) {
    if (typeof LiveAPI === "undefined") return { error: "Can't read other clips here." };
    var noop = function () {};
    var trackApi = new LiveAPI(noop, "live_set tracks " + (track - 1));
    if (Number(trackApi.id) === 0) return { error: "There is no track " + track + "." };
    var label = "Track " + track + " \"" + [].concat(trackApi.get("name")).join(" ") + "\", slot " + slot;

    var clip = new LiveAPI(noop, "live_set tracks " + (track - 1) + " clip_slots " + (slot - 1) + " clip");
    if (Number(clip.id) === 0) return { error: label + " is empty." };
    if (Number([].concat(clip.get("is_midi_clip"))[0]) !== 1) return { error: label + " isn't a MIDI clip." };

    var start = Number([].concat(clip.get("loop_start"))[0]);
    var length = Number([].concat(clip.get("loop_end"))[0]) - start;
    var raw = clip.call("get_notes_extended", 0, 128, start, length);
    var data = JSON.parse(typeof raw === "string" ? raw : [].concat(raw).join(" "));
    return { notes: data.notes || [], start: start, length: length, label: label };
}

// Lay a clip's notes (one loop of it) out again and again to fill this
// clip's time selection (or once, if there isn't one).
function tileNotes(src, ctx) {
    var range = selectionRange(ctx) || { start: 0, end: src.length };
    var notes = [];
    for (var offset = range.start; offset < range.end - 1e-6 && src.length > 0; offset += src.length) {
        src.notes.forEach(function (n) {
            var t = offset + (n.start_time - src.start);
            if (t < offset - 1e-6 || t >= range.end - 1e-6) return;
            notes.push({ pitch: n.pitch, start_time: t, duration: Math.min(n.duration, range.end - t),
                         velocity: n.velocity, mute: n.mute || 0 });
        });
    }
    return notes;
}

// Returns the new notes, or null when the chosen clip can't be read.
function transform(st, notes, ctx) {
    lastError = ""; lastSource = "";
    var passLength = 0;
    if (SOURCES[st.source] === "Trk/Slot") {
        var src = readSessionClip(st.track, st.slot);
        if (src.error) { lastError = src.error; lastChords = []; return null; }
        notes = tileNotes(src, ctx);
        lastSource = src.label;
        passLength = src.length;
    }
    var chords = detectChords(notes);
    lastChords = chords;
    if (!chords.length) {
        lastError = (lastSource || "This clip") + " has no chords in it.";
        return null;
    }
    var scalePcs = scaleFor(chords, ctx);
    var line = MODE === "melody" ? melodyLine(st, chords, scalePcs) : bassLine(st, chords, scalePcs);

    // Where phrases end, for fills: the time selection (or the chords' span),
    // and one pass = the chord clip's loop (Trk/Slot) or the whole clip.
    var range = selectionRange(ctx) || { start: chords[0].start, end: chords[chords.length - 1].end };
    var info = { start: range.start, end: range.end, passLength: passLength || (range.end - range.start) };
    // Keep everything inside the selection (chords can ring a little past it).
    line = line.filter(function (n) { return n.start_time < range.end - 1e-6; }).map(function (n) {
        n.duration = Math.min(n.duration, range.end - n.start_time);
        return n;
    });
    return lineFills(st, line, chords, scalePcs, info);
}

function readoutText() {
    var part = MODE === "melody" ? "a melody" : "a bassline";
    if (lastError) return lastError + " Pick another Trk/Slot, or use This Clip.";
    if (!lastChords.length) {
        return SOURCES[state.source] === "Trk/Slot" ?
            "Set Trk and Slot to your chord clip (Session View), then press Generate in an empty clip to write " + part + "." :
            "This Clip: open a clip of chords and press Generate to turn them into " + part + ".";
    }
    return (lastSource || "This clip") + ":  " + lastChords.map(function (c) { return c.name; }).join("  ");
}

// ─── MAX GLUE ────────────────────────────────────────────────────────────────

var generated = 0;   // 1 after the first Generate in this session
var reapply = (typeof Task !== "undefined") ?
    new Task(function () { outlet(1, "bang"); }) : null;

function changed() {
    // Only re-apply once the user has pressed Generate at least once, so
    // moving a control never rewrites a clip by surprise.
    if (ready && generated && reapply) {
        reapply.cancel();
        reapply.schedule(30);
    }
}

function pattern(v)   { state.pattern = v | 0; changed(); }
function rate(v)      { state.rate = v | 0; changed(); }
function octave(v)    { if (MODE === "melody") state.melodyOctave = v | 0; else state.bassOctave = v | 0; changed(); }
function gate(v)      { state.gate = Math.max(10, Math.min(100, v | 0)); changed(); }
function rhythm(v)    { state.rhythm = v | 0; changed(); }
function density(v)   { state.density = Math.max(0, Math.min(100, v | 0)); changed(); }
function variation(v) { state.variation = v | 0; changed(); }
function repeat(v)    { state.repeat = v ? 1 : 0; changed(); }
function velocity(v)  { state.velocity = Math.max(1, Math.min(127, v | 0)); changed(); }
function source(v)    { state.source = v | 0; lastError = ""; outlet(2, "readout", "set", readoutText()); changed(); }
function track(v)     { state.track = Math.max(1, v | 0); changed(); }
function slot(v)      { state.slot = Math.max(1, v | 0); changed(); }
function filltype(v)  { state.fillType = v | 0; changed(); }
function fillevery(v) { state.fillEvery = v | 0; changed(); }

function loaded() {
    ready = 1;
    outlet(2, "readout", "set", readoutText());
}

function dictionary(name) {
    var data = readDict(name);
    if (inlet === 1) { context = data; return; }
    generated = 1;
    var out = transform(state, data.notes || [], context);
    outlet(2, "readout", "set", readoutText());
    // Nothing to follow: hand the clip's notes back unchanged rather than erasing them.
    sendNotes("keywise_" + MODE + "_out", out === null ? (data.notes || []) : out);
}
