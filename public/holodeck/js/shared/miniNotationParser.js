/**
 * miniNotationParser.js — recursive-descent parser for the music-tool mini-
 * notation dialect defined in _refs/music-tool-plan.md §7.
 *
 * Grammar (informally):
 *
 *   pattern  := sequence
 *   sequence := element (WS element)*
 *   element  := atom ('*' INT)?
 *   atom     := NOTE | REST | group | alt | call
 *   group    := '[' sequence ']'
 *   alt      := '<' sequence '>'
 *   call     := 'choose' '(' atom (',' atom)* ')'
 *             | 'irand'  '(' INT ',' INT ')'
 *   NOTE     := [A-Ga-g] [#b]? [0-8]
 *   REST     := '~'
 *   INT      := [0-9]+
 *   WS       := one or more spaces or tabs
 *
 * Produces a tree of plain JS objects (no class instances) so the evaluator
 * can walk it without type coupling and tests can deep-equal the result.
 *
 * Tree node shapes:
 *   { type: 'seq',    items: Node[] }
 *   { type: 'group',  items: Node[] }           // [ ... ] subdivision
 *   { type: 'alt',    items: Node[] }           // < ... > cycle-rotating
 *   { type: 'note',   value: 'c3' }
 *   { type: 'rest' }
 *   { type: 'repeat', count: number, child: Node }
 *   { type: 'choose', items: Node[] }           // seeded pick at evaluation
 *   { type: 'irand',  min: number, max: number }
 *
 * Throws `MiniNotationError` with `{ message, pos }` on any malformed input.
 */

export class MiniNotationError extends Error {
    constructor(message, pos) {
        super(`${message} (at position ${pos})`);
        this.name = 'MiniNotationError';
        this.pos  = pos;
    }
}

// ─── Tokenizer ─────────────────────────────────────────────────────
//
// Flat token list with absolute source positions so parser errors point
// back to the offending character. Cheap enough that we do one pass.

const TOKEN_KINDS = Object.freeze({
    NOTE:   'NOTE',
    REST:   'REST',
    INT:    'INT',
    IDENT:  'IDENT',   // 'choose' | 'irand'
    LBRACK: 'LBRACK',  // [
    RBRACK: 'RBRACK',  // ]
    LANG:   'LANG',    // <
    RANG:   'RANG',    // >
    LPAREN: 'LPAREN',  // (
    RPAREN: 'RPAREN',  // )
    COMMA:  'COMMA',   // ,
    STAR:   'STAR',    // *
});

const NOTE_RE  = /^[A-Ga-g][#b]?[0-8]/;
const INT_RE   = /^\d+/;
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*/;

function tokenize(source) {
    const tokens = [];
    let i = 0;
    while (i < source.length) {
        const c = source[i];

        // Whitespace: skip, but remember we passed one (used only for debug).
        if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
            i++;
            continue;
        }

        // Single-character punctuation.
        const single = {
            '[': TOKEN_KINDS.LBRACK, ']': TOKEN_KINDS.RBRACK,
            '<': TOKEN_KINDS.LANG,   '>': TOKEN_KINDS.RANG,
            '(': TOKEN_KINDS.LPAREN, ')': TOKEN_KINDS.RPAREN,
            ',': TOKEN_KINDS.COMMA,  '*': TOKEN_KINDS.STAR,
            '~': TOKEN_KINDS.REST,
        }[c];
        if (single) {
            tokens.push({ kind: single, value: c, pos: i });
            i++;
            continue;
        }

        // Note — check before ident so 'c3' wins over 'c'.
        const rest = source.slice(i);
        const noteM = rest.match(NOTE_RE);
        if (noteM) {
            tokens.push({ kind: TOKEN_KINDS.NOTE, value: noteM[0], pos: i });
            i += noteM[0].length;
            continue;
        }

        // Integer.
        const intM = rest.match(INT_RE);
        if (intM) {
            tokens.push({ kind: TOKEN_KINDS.INT, value: intM[0], pos: i });
            i += intM[0].length;
            continue;
        }

        // Identifier (choose / irand).
        const idM = rest.match(IDENT_RE);
        if (idM) {
            tokens.push({ kind: TOKEN_KINDS.IDENT, value: idM[0], pos: i });
            i += idM[0].length;
            continue;
        }

        throw new MiniNotationError(`Unexpected character '${c}'`, i);
    }
    tokens.push({ kind: 'EOF', value: '', pos: source.length });
    return tokens;
}

// ─── Parser ───────────────────────────────────────────────────────

class Parser {
    constructor(tokens) {
        this.tokens = tokens;
        this.pos    = 0;
    }

    peek(offset = 0) { return this.tokens[this.pos + offset]; }
    advance()        { return this.tokens[this.pos++]; }

    expect(kind) {
        const t = this.peek();
        if (t.kind !== kind) {
            throw new MiniNotationError(`Expected ${kind}, got ${t.kind} '${t.value}'`, t.pos);
        }
        return this.advance();
    }

    parsePattern() {
        const seq = this.parseSequence(['EOF']);
        this.expect('EOF');
        return seq;
    }

    // Consume tokens into a sequence until we hit any of the terminator kinds.
    parseSequence(terminators) {
        const items = [];
        while (!terminators.includes(this.peek().kind)) {
            items.push(this.parseElement());
        }
        // Single-item sequences are returned as the item itself, not wrapped.
        // This keeps the tree compact and the evaluator simpler.
        if (items.length === 1) return items[0];
        return { type: 'seq', items };
    }

    parseElement() {
        const atom = this.parseAtom();
        if (this.peek().kind === TOKEN_KINDS.STAR) {
            const starTok = this.advance();
            const intTok  = this.peek();
            if (intTok.kind !== TOKEN_KINDS.INT) {
                throw new MiniNotationError(`Expected repetition count after '*'`, starTok.pos);
            }
            this.advance();
            const count = parseInt(intTok.value, 10);
            if (count < 1) {
                throw new MiniNotationError(`Repetition count must be >= 1`, intTok.pos);
            }
            return { type: 'repeat', count, child: atom };
        }
        return atom;
    }

    parseAtom() {
        const t = this.peek();
        switch (t.kind) {
            case TOKEN_KINDS.NOTE:
                this.advance();
                return { type: 'note', value: t.value.toLowerCase() };
            case TOKEN_KINDS.REST:
                this.advance();
                return { type: 'rest' };
            case TOKEN_KINDS.LBRACK:
                return this.parseGroup();
            case TOKEN_KINDS.LANG:
                return this.parseAlt();
            case TOKEN_KINDS.IDENT:
                return this.parseCall();
            default:
                throw new MiniNotationError(`Unexpected token '${t.value}'`, t.pos);
        }
    }

    parseGroup() {
        this.expect(TOKEN_KINDS.LBRACK);
        const seq = this.parseSequence([TOKEN_KINDS.RBRACK]);
        this.expect(TOKEN_KINDS.RBRACK);
        // Always wrap so the evaluator knows this is a subdivided slot.
        return { type: 'group', items: seq.type === 'seq' ? seq.items : [seq] };
    }

    parseAlt() {
        this.expect(TOKEN_KINDS.LANG);
        const seq = this.parseSequence([TOKEN_KINDS.RANG]);
        this.expect(TOKEN_KINDS.RANG);
        return { type: 'alt', items: seq.type === 'seq' ? seq.items : [seq] };
    }

    parseCall() {
        const idTok = this.advance();
        this.expect(TOKEN_KINDS.LPAREN);
        if (idTok.value === 'choose') {
            const items = [this.parseAtom()];
            while (this.peek().kind === TOKEN_KINDS.COMMA) {
                this.advance();
                items.push(this.parseAtom());
            }
            this.expect(TOKEN_KINDS.RPAREN);
            if (items.length === 0) {
                throw new MiniNotationError(`choose() needs at least one option`, idTok.pos);
            }
            return { type: 'choose', items };
        }
        if (idTok.value === 'irand') {
            const minTok = this.expect(TOKEN_KINDS.INT);
            this.expect(TOKEN_KINDS.COMMA);
            const maxTok = this.expect(TOKEN_KINDS.INT);
            this.expect(TOKEN_KINDS.RPAREN);
            const min = parseInt(minTok.value, 10);
            const max = parseInt(maxTok.value, 10);
            if (min > max) {
                throw new MiniNotationError(`irand bounds reversed: ${min} > ${max}`, idTok.pos);
            }
            return { type: 'irand', min, max };
        }
        throw new MiniNotationError(`Unknown function '${idTok.value}'`, idTok.pos);
    }
}

// ─── Public API ───────────────────────────────────────────────────

/**
 * Parse a mini-notation pattern string into a tree the evaluator can walk.
 * @param {string} source
 * @returns {object} parsed tree
 * @throws  {MiniNotationError}
 */
export function parse(source) {
    if (typeof source !== 'string') {
        throw new MiniNotationError(`Expected string, got ${typeof source}`, 0);
    }
    const trimmed = source.trim();
    if (trimmed.length === 0) {
        throw new MiniNotationError(`Empty pattern`, 0);
    }
    const tokens = tokenize(trimmed);
    return new Parser(tokens).parsePattern();
}

/**
 * Walk a parsed tree and return every leaf pattern it references (notes,
 * rests, and irand bounds). Useful for schema validators that want to check
 * register bounds without re-implementing a walker.
 */
export function collectLeaves(tree) {
    const leaves = [];
    const walk = (node) => {
        if (!node) return;
        switch (node.type) {
            case 'note': case 'rest': case 'irand':
                leaves.push(node);
                return;
            case 'repeat':
                walk(node.child);
                return;
            case 'seq': case 'group': case 'alt': case 'choose':
                for (const child of node.items) walk(child);
                return;
            default:
                throw new Error(`collectLeaves: unknown node type '${node.type}'`);
        }
    };
    walk(tree);
    return leaves;
}

/**
 * Check whether a tree contains any randomized element — required per plan
 * §7 ("patterns must use choose() or irand() at least once per layer").
 */
export function hasRandomization(tree) {
    return collectLeaves(tree).some(l => l.type === 'irand')
        || _containsNodeType(tree, 'choose');
}

function _containsNodeType(node, kind) {
    if (!node) return false;
    if (node.type === kind) return true;
    if (node.type === 'repeat') return _containsNodeType(node.child, kind);
    if (Array.isArray(node.items)) return node.items.some(c => _containsNodeType(c, kind));
    return false;
}
