// Minimal JSON parser that records the source position (line/column) where each value
// begins, keyed by JSON Pointer. Used to jump from a validation finding to the editor line.
// It does not throw on malformed JSON; it returns whatever it parsed so far.

/**
 * @param {string} text
 * @returns {Map<string,{line:number,column:number,pointer:string}>}
 *   line/column are 0-based (Ace convention). Root pointer is "".
 */
export function buildPointerMap(text) {
  const map = new Map();
  let i = 0;
  let line = 0;
  let col = 0;
  const len = text.length;

  function record(pointer) {
    if (!map.has(pointer)) map.set(pointer, { line, column: col, pointer });
  }

  function advance() {
    const ch = text[i++];
    if (ch === "\n") {
      line++;
      col = 0;
    } else {
      col++;
    }
    return ch;
  }

  function skipWs() {
    while (i < len) {
      const ch = text[i];
      if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") advance();
      else break;
    }
  }

  function parseString() {
    // assumes current char is the opening quote
    advance(); // opening "
    let out = "";
    while (i < len) {
      const ch = advance();
      if (ch === "\\") {
        const esc = advance();
        switch (esc) {
          case "n": out += "\n"; break;
          case "t": out += "\t"; break;
          case "r": out += "\r"; break;
          case "b": out += "\b"; break;
          case "f": out += "\f"; break;
          case "/": out += "/"; break;
          case "\\": out += "\\"; break;
          case '"': out += '"'; break;
          case "u": {
            const hex = text.slice(i, i + 4);
            for (let k = 0; k < 4 && i < len; k++) advance();
            out += String.fromCharCode(parseInt(hex, 16) || 0);
            break;
          }
          default: out += esc;
        }
      } else if (ch === '"') {
        break;
      } else {
        out += ch;
      }
    }
    return out;
  }

  function parseValue(pointer) {
    skipWs();
    record(pointer);
    const ch = text[i];
    if (ch === "{") return parseObject(pointer);
    if (ch === "[") return parseArray(pointer);
    if (ch === '"') return parseString();
    // primitive: number/true/false/null
    while (i < len && !",]}".includes(text[i]) && !/\s/.test(text[i])) advance();
    return null;
  }

  function parseObject(pointer) {
    advance(); // {
    skipWs();
    if (text[i] === "}") {
      advance();
      return;
    }
    while (i < len) {
      skipWs();
      if (text[i] !== '"') break;
      const key = parseString();
      skipWs();
      if (text[i] === ":") advance();
      parseValue(pointer + "/" + escapePointer(key));
      skipWs();
      if (text[i] === ",") {
        advance();
        continue;
      }
      if (text[i] === "}") {
        advance();
        break;
      }
      break;
    }
  }

  function parseArray(pointer) {
    advance(); // [
    skipWs();
    if (text[i] === "]") {
      advance();
      return;
    }
    let index = 0;
    while (i < len) {
      parseValue(pointer + "/" + index);
      index++;
      skipWs();
      if (text[i] === ",") {
        advance();
        continue;
      }
      if (text[i] === "]") {
        advance();
        break;
      }
      break;
    }
  }

  try {
    parseValue("");
  } catch {
    /* best-effort */
  }
  return map;
}

function escapePointer(token) {
  return token.replace(/~/g, "~0").replace(/\//g, "~1");
}

/** Normalize a cfworker instanceLocation ("#/a/b") to a plain pointer ("/a/b"). */
export function normalizeInstanceLocation(loc) {
  if (typeof loc !== "string") return "";
  return loc.replace(/^#/, "");
}
