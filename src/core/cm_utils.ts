/**
 * CodeMirror-related utils
 *
 * @internal Part of HyperMD core.
 *
 * You shall NOT import this file; please import "core" instead
 */

import * as cm_internal from "./cm_internal"
import { cm_t } from "./type"
import { Token, Position } from "codemirror";

export { cm_internal }

/**
 * Useful tool to seek for tokens
 *
 *     var seeker = new TokenSeeker(cm)
 *     seeker.setPos(0, 0) // set to line 0, char 0
 *     var ans = seeker.findNext(/fomratting-em/)
 *
 */
export class TokenSeeker {
  constructor(public cm: cm_t) {

  }

  line: CodeMirror.LineHandle
  lineNo: number
  lineTokens: Token[]    // always same as cm.getLineTokens(line)
  i_token: number                   // current token's index

  /**
   * Find next Token that matches the condition AFTER current token (whose index is `i_token`), or a given position
   * This function will NOT make the stream precede!
   *
   * @param condition a RegExp to check token.type, or a function check the Token
   * @param maySpanLines by default the searching will not span lines
   */
  findNext(condition: RegExp | ((token: Token) => boolean), maySpanLines?: boolean, since?: Position): { lineNo: number, token: Token, i_token: number }

  /**
   * In current line, find next Token that matches the condition SINCE the token with given index
   * This function will NOT make the stream precede!
   *
   * @param condition a RegExp to check token.type, or a function check the Token
   * @param i_token_since default: i_token+1 (the next of current token)
   */
  findNext(condition: RegExp | ((token: Token) => boolean), i_token_since: number): { lineNo: number, token: Token, i_token: number }


  findNext(condition: RegExp | ((token: Token) => boolean), varg?: boolean | number, since?: Position): { lineNo: number, token: Token, i_token: number } {
    var lineNo = this.lineNo
    var tokens = this.lineTokens
    var token: Token = null

    var i_token: number = this.i_token + 1
    var maySpanLines = false

    if (varg === true) {
      maySpanLines = true
    } else if (typeof varg === 'number') {
      i_token = varg
    }

    if (since) {
      if (since.line > lineNo) {
        i_token = tokens.length // just ignore current line
      } else if (since.line < lineNo) {
        // hmmm... we shall NEVER go back
      } else {
        for (; i_token < tokens.length; i_token++) {
          if (tokens[i_token].start >= since.ch) break
        }
      }
    }

    for (; i_token < tokens.length; i_token++) {
      var token_tmp = tokens[i_token]
      if ((typeof condition === "function") ? condition(token_tmp) : condition.test(token_tmp.type)) {
        token = token_tmp
        break
      }
    }

    if (!token && maySpanLines) {
      const cm = this.cm
      const startLine = Math.max(since ? since.line : 0, lineNo + 1)
      cm.eachLine(startLine, cm.lastLine() + 1, (line_i) => {
        lineNo = line_i.lineNo()
        tokens = cm.getLineTokens(lineNo)

        i_token = 0
        if (since && lineNo === since.line) {
          for (; i_token < tokens.length; i_token++) {
            if (tokens[i_token].start >= since.ch) break
          }
        }

        for (; i_token < tokens.length; i_token++) {
          var token_tmp = tokens[i_token]
          if ((typeof condition === "function") ? condition(token_tmp) : condition.test(token_tmp.type)) {
            token = token_tmp
            return true // stop `eachLine`
          }
        }
      })
    }

    return token ? { lineNo, token, i_token } : null
  }

  setPos(ch: number);
  setPos(line: number | CodeMirror.LineHandle, ch: number);

  /**
   * Update seeker's cursor position
   *
   * @param precise if true, lineTokens will be refresh even if lineNo is not changed
   */
  setPos(line: number | CodeMirror.LineHandle, ch: number, precise?: boolean);

  setPos(line: number | CodeMirror.LineHandle, ch?: number, precise?: boolean) {
    if (ch === void 0) { ch = line as number; line = this.line }
    else if (typeof line === 'number') line = this.cm.getLineHandle(line);

    const sameLine = line === this.line;
    var i_token = 0

    if (precise || !sameLine) {
      this.line = line
      this.lineNo = line.lineNo()
      this.lineTokens = this.cm.getLineTokens(this.lineNo)
    } else {
      // try to speed-up seeking
      i_token = this.i_token
      let token = this.lineTokens[i_token]
      if (token.start > ch) i_token = 0
    }

    var tokens = this.lineTokens
    for (; i_token < tokens.length; i_token++) {
      if (tokens[i_token].end > ch) break // found
    }

    this.i_token = i_token
  }
}

/**
 * CodeMirror's `getLineTokens` might merge adjacent chars with same styles,
 * but this one won't.
 *
 * This one will consume more memory.
 *
 * @param {CodeMirror.LineHandle} line
 * @returns {string[]} every char's style
 */
export function getEveryCharToken(line: CodeMirror.LineHandle): string[] {
  var ans = new Array(line.text.length)
  var ss = line.styles
  var i = 0

  if (ss) {
    // CodeMirror already parsed this line. Use cache
    for (let j = 1; j < ss.length; j += 2) {
      let i_to = ss[j], s = ss[j + 1]
      while (i < i_to) ans[i++] = s
    }
  } else {
    // Emmm... slow method
    let cm = line.parent.cm || line.parent.parent.cm || line.parent.parent.parent.cm
    let ss = cm.getLineTokens(line.lineNo())
    for (let j = 0; j < ss.length; j++) {
      let i_to = ss[j].end, s = ss[j].type
      while (i < i_to) ans[i++] = s
    }
  }
  return ans
}

/**
 * return a range in which every char has the given style (aka. token type).
 * assuming char at `pos` already has the style.
 *
 * the result will NOT span lines.
 *
 * @param style aka. token type
 * @see exapndRange2 if you want to span lines
 */
export function expandRange(cm: cm_t, pos: CodeMirror.Position, style: string) {
  var line = pos.line
  var from: CodeMirror.Position = { line, ch: 0 }
  var to: CodeMirror.Position = { line, ch: pos.ch }

  var styleRE = new RegExp("(?:^|\\s)" + style + "(?:\\s|$)")
  var tokens = cm.getLineTokens(line)

  var iSince
  for (iSince = 0; iSince < tokens.length; iSince++) {
    if (tokens[iSince].end >= pos.ch) break
  }
  if (iSince === tokens.length) return null

  for (var i = iSince; i < tokens.length; i++) {
    var token = tokens[i]
    if (styleRE.test(token.type)) to.ch = token.end
    else break
  }

  for (var i = iSince; i >= 0; i--) {
    var token = tokens[i]
    if (!styleRE.test(token.type)) {
      from.ch = token.end
      break
    }
  }

  return { from, to }
}

/**
 * clean line measure caches (if needed)
 * and re-position cursor
 *
 * partially extracted from codemirror.js : function updateSelection(cm)
 *
 * @param {cm_t} cm
 * @param {boolean} skipCacheCleaning
 */
export function updateCursorDisplay(cm: cm_t, skipCacheCleaning?: boolean) {
  if (!skipCacheCleaning) {
    var lvs = cm.display.view as any[] // LineView s
    for (var lineView of lvs) {
      if (lineView.measure) lineView.measure.cache = {}
    }
  }

  setTimeout(function () {
    cm.display.input.showSelection(cm.display.input.prepareSelection())
  }, 60) // wait for css style
}
