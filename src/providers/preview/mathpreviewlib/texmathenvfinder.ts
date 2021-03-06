import * as vscode from 'vscode'

import * as utils from '../../../utils/utils'
import {TextDocumentLike} from './textdocumentlike'
import type {Suggestion as ReferenceEntry} from '../../completer/reference'

export type TexMathEnv = { texString: string, range: vscode.Range, envname: string }

export class TeXMathEnvFinder {

    findHoverOnTex(document: vscode.TextDocument | TextDocumentLike, position: vscode.Position): TexMathEnv | undefined {
        const envBeginPat = /\\begin\{(align|align\*|alignat|alignat\*|aligned|alignedat|array|Bmatrix|bmatrix|cases|CD|eqnarray|eqnarray\*|equation|equation\*|gather|gather\*|gathered|matrix|multline|multline\*|pmatrix|smallmatrix|split|subarray|Vmatrix|vmatrix)\}/
        let r = document.getWordRangeAtPosition(position, envBeginPat)
        if (r) {
            const envname = this.getFirstRmemberedSubstring(document.getText(r), envBeginPat)
            return this.findHoverOnEnv(document, envname, r.start)
        }
        const parenBeginPat = /(\\\[|\\\(|\$\$)/
        r = document.getWordRangeAtPosition(position, parenBeginPat)
        if (r) {
            const paren = this.getFirstRmemberedSubstring(document.getText(r), parenBeginPat)
            return this.findHoverOnParen(document, paren, r.start)
        }
        return this.findHoverOnInline(document, position)
    }

    findHoverOnRef(document: vscode.TextDocument, position: vscode.Position, token: string, refData: ReferenceEntry): TexMathEnv | undefined {
        const docOfRef = TextDocumentLike.load(refData.file)
        const envBeginPatMathMode = /\\begin\{(align|align\*|alignat|alignat\*|eqnarray|eqnarray\*|equation|equation\*|gather|gather\*)\}/
        const l = docOfRef.lineAt(refData.position.line).text
        const pat = new RegExp('\\\\label\\{' + utils.escapeRegExp(token) + '\\}')
        const m = l.match(pat)
        if (m && m.index !== undefined) {
            const labelPos = new vscode.Position(refData.position.line, m.index)
            const beginPos = this.findBeginPair(docOfRef, envBeginPatMathMode, labelPos)
            if (beginPos) {
                const t = this.findHoverOnTex(docOfRef, beginPos)
                if (t) {
                    const beginEndRange = t.range
                    const refRange = document.getWordRangeAtPosition(position, /\{.*?\}/)
                    if (refRange && beginEndRange.contains(labelPos)) {
                        t.range = refRange
                        return t
                    }
                }
            }
        }
        return undefined
    }

    findMathEnvIncludingPosition(document: vscode.TextDocument, position: vscode.Position): TexMathEnv | undefined {
        const envNamePatMathMode = /(align|align\*|alignat|alignat\*|eqnarray|eqnarray\*|equation|equation\*|gather|gather\*)/
        const envBeginPatMathMode = /\\\[|\\\(|\\begin\{(align|align\*|alignat|alignat\*|eqnarray|eqnarray\*|equation|equation\*|gather|gather\*)\}/
        let texMath = this.findHoverOnTex(document, position)
        if (texMath && (texMath.envname === '$' || texMath.envname.match(envNamePatMathMode))) {
            return texMath
        }
        const beginPos = this.findBeginPair(document, envBeginPatMathMode, position)
        if (beginPos) {
            texMath = this.findHoverOnTex(document, beginPos)
            if (texMath) {
                const beginEndRange = texMath.range
                if (beginEndRange.contains(position)) {
                    return texMath
                }
            }
        }
        return
    }

    private getFirstRmemberedSubstring(s: string, pat: RegExp): string {
        const m = s.match(pat)
        if (m && m[1]) {
            return m[1]
        }
        return 'never return here'
    }

    private removeComment(line: string): string {
        return line.replace(/^((?:\\.|[^%])*).*$/, '$1')
    }

    //  \begin{...}                \end{...}
    //             ^
    //             startPos1
    private findEndPair(document: vscode.TextDocument | TextDocumentLike, endPat: RegExp, startPos1: vscode.Position): vscode.Position | undefined {
        const currentLine = document.lineAt(startPos1).text.substring(startPos1.character)
        const l = this.removeComment(currentLine)
        let m = l.match(endPat)
        if (m && m.index !== undefined) {
            return new vscode.Position(startPos1.line, startPos1.character + m.index + m[0].length)
        }

        let lineNum = startPos1.line + 1
        while (lineNum <= document.lineCount) {
            m = this.removeComment(document.lineAt(lineNum).text).match(endPat)
            if (m && m.index !== undefined) {
                return new vscode.Position(lineNum, m.index + m[0].length)
            }
            lineNum += 1
        }
        return undefined
    }

    //  \begin{...}                \end{...}
    //  ^                          ^
    //  return pos                 endPos1
    private findBeginPair(document: vscode.TextDocument | TextDocumentLike, beginPat: RegExp, endPos1: vscode.Position, limit= 20): vscode.Position | undefined {
        const currentLine = document.lineAt(endPos1).text.substr(0, endPos1.character)
        let l = this.removeComment(currentLine)
        let m = l.match(beginPat)
        if (m && m.index !== undefined) {
            return new vscode.Position(endPos1.line, m.index)
        }
        let lineNum = endPos1.line - 1
        let i = 0
        while (lineNum >= 0 && i < limit) {
            l = document.lineAt(lineNum).text
            l = this.removeComment(l)
            m = l.match(beginPat)
            if (m && m.index !== undefined) {
                return new vscode.Position(lineNum, m.index)
            }
            lineNum -= 1
            i += 1
        }
        return undefined
    }

    //  \begin{...}                \end{...}
    //  ^
    //  startPos
    private findHoverOnEnv(document: vscode.TextDocument | TextDocumentLike, envname: string, startPos: vscode.Position): TexMathEnv | undefined {
        const pattern = new RegExp('\\\\end\\{' + utils.escapeRegExp(envname) + '\\}')
        const startPos1 = new vscode.Position(startPos.line, startPos.character + envname.length + '\\begin{}'.length)
        const endPos = this.findEndPair(document, pattern, startPos1)
        if ( endPos ) {
            const range = new vscode.Range(startPos, endPos)
            return {texString: document.getText(range), range, envname}
        }
        return undefined
    }

    //  \[                \]
    //  ^
    //  startPos
    private findHoverOnParen(document: vscode.TextDocument | TextDocumentLike, envname: string, startPos: vscode.Position): TexMathEnv | undefined {
        const pattern = envname === '\\[' ? /\\\]/ : envname === '\\(' ? /\\\)/ : /\$\$/
        const startPos1 = new vscode.Position(startPos.line, startPos.character + envname.length)
        const endPos = this.findEndPair(document, pattern, startPos1)
        if ( endPos ) {
            const range = new vscode.Range(startPos, endPos)
            return {texString: document.getText(range), range, envname}
        }
        return undefined
    }

    private findHoverOnInline(document: vscode.TextDocument | TextDocumentLike, position: vscode.Position): TexMathEnv | undefined {
        let maxInspectedLines = 50

        // matches a single $ which is not preceded by \ and neither followed nor preceded by $
        const singleDollarRegex = /(?<!\$|\\)\$(?!\$)/g

        let positions: vscode.Position[] = []
        for (let line, linePos = position.line;
            linePos >= 0 && (line = document.lineAt(linePos).text);
            linePos--) {

            if (maxInspectedLines-- <= 0) {
                return this.findHoverOnInlineFallback(document, position)
            }

            const linePositions: vscode.Position[] = []
            let match = null
            while ((match = singleDollarRegex.exec(line))) {
                if (linePos === position.line && match.index > position.character) {
                    // Skip dollars on the same line that appear after the cursor
                    continue
                }
                linePositions.push(new vscode.Position(linePos, match.index))
            }
            // reverse linePositions because they appear from first to last
            // instead of the other way around
            positions = positions.concat(linePositions.reverse())
        }

        if (positions.length <= 0) {
            return undefined // no opening dollar sign -> not in math mode
        }

        const firstPos = positions[0]
        if (positions.length % 2 === 0) {
            if (firstPos.isEqual(position)) {
                const range = new vscode.Range(positions[1].translate(undefined, 1), firstPos)
                return { texString: document.getText(range), range, envname: '$' }
            } else {
                return undefined // even number of dollars in front -> not in math mode
            }
        }

        for (let line, linePos = position.line;
            linePos < document.lineCount && (line = document.lineAt(linePos).text);
            linePos++) {

            let match = null
            while ((match = singleDollarRegex.exec(line))) {
                if (linePos > position.line || match.index > position.character) {
                    // only consider matches that appear after the cursor position
                    const range = new vscode.Range(firstPos.line, firstPos.character + 1, linePos, match.index)
                    return { texString: document.getText(range), range, envname: '$' }
                }
            }

            if (maxInspectedLines-- <= 0) {
                return this.findHoverOnInlineFallback(document, position)
            }
        }

        return undefined
    }

    private findHoverOnInlineFallback(document: vscode.TextDocument | TextDocumentLike, position: vscode.Position): TexMathEnv | undefined {
        const currentLine = document.lineAt(position.line).text
        const regex = /(?<!\$|\\)\$(?!\$)(?:\\.|[^\\])+?\$|\\\(.+?\\\)/
        let s = currentLine
        let base = 0
        let m: RegExpMatchArray | null = s.match(regex)
        while (m) {
            if (m.index !== undefined) {
                const matchStart = base + m.index
                const matchEnd = base + m.index + m[0].length
                if ( matchStart <= position.character && position.character <= matchEnd ) {
                    const range = new vscode.Range(position.line, matchStart, position.line, matchEnd)
                    return {texString: document.getText(range), range, envname: '$'}
                } else {
                    base = matchEnd
                    s = currentLine.substring(base)
                }
            } else {
                break
            }
            m = s.match(regex)
        }
        return undefined
    }
}
