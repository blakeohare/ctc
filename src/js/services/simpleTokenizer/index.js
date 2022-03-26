(() => {

    const WHITESPACE = new Set(" \t\r\n".split(""));
    const LETTERS = "abcdefghijklmnopqrstuvwxyz";
    const ALPHA_NUMS = new Set((LETTERS + LETTERS.toUpperCase() + "_0123456789").split(""));

    const handleJsonRequest = (data, cb, errCb) => {
        let { filename, code, options } = data;
        if (!filename) return errCb('BAD_REQUEST', "Missing filename argument.");
        if (!code) return errCb('BAD_REQUEST', "Missing code argument.");
        options = options || {};
        let newlineIsControl = !!options.newlineControl;
        code = code.split("\r\n").join("\n").split("\r").join("\n") + "\n";

        // TODO: unicode split
        let chars = code.split("");
        
        let lines = [];
        let cols = [];
        let line = 1;
        let col = 1;
        for (let i = 0; i < chars.length; i++) {
            lines.push(line);
            cols.push(col);
            let c = chars[i];
            if (c == "\n") {
                col = 1;
                line++;
            } else {
                col++;
            }
        }

        const tokens = [];
        let state = 'NORMAL';
        let tokenStart = 0;
        let tokenSubtype = "";
        const len = chars.length;
        let c;
        let isPunc = false;
        for (let i = 0; i < len; i++) {
            c = chars[i];
            switch (state) {
                case 'NORMAL':
                    isPunc = false;
                    if (WHITESPACE.has(c)) {
                        if (newlineIsControl && c === '\n') {
                            tokens.push({ value: c, type: 'newline', line: lines[i], col: cols[i] });
                        } else {
                            // ignore
                        }
                    } else if (ALPHA_NUMS.has(c)) {
                        tokenStart = i;
                        state = 'WORD';
                    } else if (c == "'" || c == '"') {
                        tokenStart = i;
                        state = 'STRING';
                        tokenSubtype = c;
                    } else if (c == '/') {
                        let next = chars[i + 1];
                        if (next === '/' || next === '*') {
                            state = 'COMMENT';
                            tokenSubtype = next;
                            i++;
                        } else {
                            isPunc = true;
                        }
                    } else {
                        isPunc = true;
                    }

                    if (isPunc) {
                        tokens.push({ value: c, type: 'punc', line: lines[i], col: cols[i] });
                    }
                    break;
                
                case 'WORD':
                    if (!ALPHA_NUMS.has(c)) {
                        tokens.push({ value: chars.slice(tokenStart, i).join(""), type: 'word', line: lines[tokenStart], col: cols[tokenStart] });
                        state = 'NORMAL';
                        i--;
                    } else {
                        // keep going
                    }
                    break;
                
                case 'STRING':
                    if (c === '\\') {
                        i++; // tokenizer does not verify validity of escape sequences
                    } else if (c === tokenSubtype) {
                        tokens.push({ value: chars.slice(tokenStart, i + 1).join(""), type: 'string', line: lines[tokenStart], col: cols[tokenStart] });
                        state = 'NORMAL';
                    } else {
                        // keep going
                    }
                    break;

                case 'COMMENT':
                    if (tokenSubtype === '*') {
                        if (c == '*' && chars[i + 1] === '/') {
                            i++;
                            state = 'NORMAL';
                        }
                    } else {
                        if (c == '\n') {
                            state = 'NORMAL';
                            --i; // just in case newlines are control characters.
                        }
                    }
                    break;
                
                default: throw new Error(); // should not happen
            }
        }

        if (state !== 'NORMAL') {
            return errCb('UNCLOSED_ITEM', "There is an unclosed comment or string in this code."); 
        }

        // TODO: consolidate decimals and have various modes for number formats, such as F suffix of 0x prefix

        let tokenValues = [];
        let tokenLines = [];
        let tokenCols = [];

        // TODO: also include sub-token streams for string interpolation

        tokens.forEach(tok => {
            tokenValues.push(tok.value);
            tokenLines.push(tok.line);
            tokenCols.push(tok.col);
        });

        cb({
            file: filename,
            values: tokenValues,
            lines: tokenLines,
            cols: tokenCols,
        });
    };

    (typeof(process) === 'undefined' ? window : global).CTC.initializeService("simpleTokenizer", "0.1.0", {
        handleJsonRequest,
    });
})();
