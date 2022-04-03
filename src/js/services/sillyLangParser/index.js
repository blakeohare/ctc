(() => {
    
    const createInternalTokenStream = (filename, values, lines, cols, multicharTokens) => {
        let index = 0;
        let len = values.length;
        let next = null;

        // accommodates only len-2 strings
        let mcTokensByFirstChar = {};
        multicharTokens.forEach(mcToken => {
            let c = mcToken.charAt(0);
            if (!mcTokensByFirstChar[c]) mcTokensByFirstChar[c] = {};
            mcTokensByFirstChar[c][mcToken.charAt(1)] = true;
        });

        let peek = () => {
            if (next) return next;
            if (index >= len) return null;
            next = { file: filename, value: values[index], line: lines[index], col: cols[index], size: 1 };
            if (mcTokensByFirstChar[next.value] && index + 1 < len) {
                let nextChar = values[index + 1];
                if (mcTokensByFirstChar[next.value][nextChar] && lines[index] == lines[index + 1] && cols[index] + 1 == cols[index + 1]) {
                    next.value += nextChar;
                    next.size = 2;
                }
            }
            return next;
        };

        let pop = () => {
            let token = peek();
            if (token) {
                index += token.size;
                next = null;
            }
            return token;
        };

        return { peek, pop, hasMore: () => index < len };
    };

    const TokenStream = function (filename, values, lines, cols, multicharTokens) {
        let _this = this;
        let stream = createInternalTokenStream(filename, values, lines, cols, multicharTokens);

        _this.peek = () => stream.peek();
        _this.pop = () => stream.pop();
        _this.hasMore = () => stream.hasMore();

        _this.peekValue = () => {
            let token = stream.peek();
            if (token) return token.value;
            return null;
        };

        _this.hasMore = () => stream.hasMore();
        
        _this.popIfPresent = (value) => {
            if (_this.peekValue() === value) {
                stream.pop();
                return true;
            }
            return false;
        };

        _this.popExpected = (value) => {
            let next = _this.peekValue();
            if (next === value) {
                return stream.pop();
            }
            if (!next) next = "<END-OF-FILE>";
            throw new Error("Expected '" + value + "' but found '" + next + "'");
        };

        _this.isNext = (value) => {
            let t = stream.peek();
            return t && t.value === value;
        };

        let charCodes = {
            a: "a".charCodeAt(0),
            z: "z".charCodeAt(0),
            A: "A".charCodeAt(0),
            Z: "Z".charCodeAt(0),
        };
        _this.popWord = () => {
            let t = stream.pop();
            if (!t) throw new Error("Expected word but found <END-OF-FILE>");
            let c = t.value.charAt(0);
            if (c === '_') return t;
            let cc = c.charCodeAt(0);
            
            if ((cc < charCodes.a || cc > charCodes.z) &&
                (cc < charCodes.A || cc > charCodes.Z)) {
                throw new Error("Expected word but found '" + t.value + "'");
            }
            return t;
        };
    };

    const createOpChainParser = (validOps, nextParser) => {
        let opsLookup = new Set(validOps);
        return (tokens) => {
            let expr = nextParser(tokens);
            if (opsLookup.has(tokens.peekValue() || '')) {
                let expressions = [expr];
                let ops = [];
                while (opsLookup.has(tokens.peekValue() || '')) {
                    ops.push(tokens.pop());
                    expressions.push(nextParser(tokens));
                }
                return { type: 'ops', expressions, ops };
            }
            return expr;
        };
    };

    let charCodes = {};
    let letters = "abcdefghijklmnopqrstuvwxyz";
    (letters + letters.toUpperCase() + "_0123456789").split("").forEach(c => {
        charCodes[c] = c.charCodeAt(0);
    });

    const parseIntOrNull = str => {
        let value = 0;
        let zero = '0'.charCodeAt(0);
        for (let i = 0; i < str.length; i++) {
            let digit = str.charCodeAt(i) - zero;
            if (digit < 0 || digit > 9) return null;
            value = value * 10 + digit;
        }
        return value;
    };

    const parseStringValue = (codeValue) => {
        let sb = [];
        let len = codeValue.length - 1;
        let c;
        for (let i = 1; i < len; i++) {
            c = codeValue.charAt(i);
            if (c === '\\') {
                if (i + 1 >= len) throw new Error("Invalid escape sequence: terminating backslash");
                switch (codeValue[i + 1]) {
                    case 'r': sb.push('\r'); break;
                    case 'n': sb.push('\n'); break;
                    case '"': sb.push('"'); break;
                    case "'": sb.push("'"); break;
                    case 't': sb.push('\t'); break;
                    case '\\': sb.push('\\'); break;
                    default:
                        throw new Error("Invalid escape sequence: \\" + codeValue[i + 1]);
                }
                i++;
            } else {
                sb.push(c);
            }
        }
        return sb.join("");
    };

    const parseEntity = (tokens) => {
        let next = tokens.peekValue() || '';
        switch (next) {
            case 'true': 
            case 'false':
                tokens.pop();
                return { type: 'bool', value: next === 'true' };
            case 'null':
                tokens.pop();
                return { type: 'null' };
            case '$':
                tokens.pop();
                return { type: 'sysFunc', name: tokens.popWord().value };
            default: break;
        }

        let c = next.charAt(0);

        if (c === "'" || c === '"') {
            tokens.pop();
            return { type: 'string', value: parseStringValue(next) };
        }

        let cc = c.charCodeAt(0);

        if (c === '_' || (cc >= charCodes.a && cc <= charCodes.z) || (cc >= charCodes.A && cc <= charCodes.Z)) {
            tokens.pop();
            if (next === 'CTC') {
                return { type: 'CTC' };
            }
            return { type: 'variable', name: next };
        }

        let numValue = parseIntOrNull(next);
        if (numValue !== null) {
            tokens.pop();
            if (tokens.popIfPresent('.')) {
                let decimalValue = tokens.peekValue();
                if (parseIntOrNull(decimalValue) !== null) {
                    tokens.pop();
                    numValue = parseFloat(numValue + '.' + decimalValue); // includes preceding 0's
                    return { type: 'float', value: numValue };
                }
                throw new Error("Unexpected '.'");
            }
            return { type: 'integer', value: numValue };
        }

        if (tokens.popIfPresent('.')) {
            let decimalValue = tokens.peekValue();
            if (parseIntOrNull(decimalValue) !== null) {
                tokens.pop();
                let numValue = '0.' + decimalValue; // includes preceding 0's
                return { type: 'float', value: parseFloat(numValue) };
            }
        }

        throw new Error("Unexpected token: '" + next + "'");
    };

    const parseWrapperAndSuffix = (tokens) => {
        let expr;
        if (tokens.isNext('(')) {
            tokens.popExpected('(');
            expr = parseExpression(tokens);
            tokens.popExpected(')');
        } else {
            expr = parseEntity(tokens);
        }

        let checkSuffixes = true;
        while (checkSuffixes) {
            switch (tokens.peekValue() || '') {
                case '.':
                    {
                        tokens.pop();
                        let fieldName = tokens.popWord();
                        expr = { type: 'field', root: expr, name: fieldName.value };
                    }
                    break;
                
                case '[':
                    {
                        tokens.pop();
                        let key = parseExpression(tokens);
                        tokens.popExpected(']');
                        expr = { type: 'index', root: expr, index: key };
                    }
                    break;
                
                case '(':
                    {
                        tokens.pop();
                        let args = [];
                        while (!tokens.popIfPresent(')')) {
                            if (args.length) tokens.popExpected(',');
                            args.push(parseExpression(tokens));
                        }
                        expr = { type: 'invoke', root: expr, args };
                    }
                    break;
                
                default:
                    checkSuffixes = false;
                    break;
            }
        }
        return expr;
    };

    const parseUnary = (tokens) => {
        if (tokens.isNext('not')) {
            tokens.pop();
            return { type: 'not', root: parseUnary(tokens) };
        }

        if (tokens.isNext('-')) {
            tokens.pop();
            return { type: 'neg', root: parseUnary(tokens) };
        }

        return parseWrapperAndSuffix(tokens);
    };

    const parseMultiplication = createOpChainParser("* / %".split(' '), parseUnary);
    const parseAddition = createOpChainParser("+ -".split(' '), parseMultiplication);
    const parseInequality = createOpChainParser("<= >= < >".split(' '), parseAddition);
    const parseEquality = createOpChainParser("== !=".split(' '), parseInequality);
    const parseOr = createOpChainParser(["or"], parseEquality);
    const parseAnd = createOpChainParser(["and"], parseOr);

    const parseExpression = (tokens) => {
        return parseAnd(tokens);
    };

    const parseLabel = (tokens) => {
        tokens.popExpected('@');
        let label = tokens.popWord();
        return { type: "label", label: label.value };
    };

    const parseIf = (tokens) => {
        tokens.popExpected('if');
        let condition = parseExpression(tokens);
        tokens.popExpected('goto');
        let trueLabel = parseLabel(tokens).label;
        let falseLabel = null;
        if (tokens.popIfPresent('else')) {
            falseLabel = parseLabel(tokens).label;
        }
        return { type: 'if', condition, trueGoto: trueLabel, falseGoto: falseLabel };
    };

    const parseGoto = (tokens) => {
        tokens.popExpected('goto');
        let label = parseLabel(tokens);
        return { type: 'goto', label: label.label };
    };

    const parsePrint = (tokens) => {
        tokens.popExpected('print');
        let expression = parseExpression(tokens);
        return { type: 'print', expression };
    };

    const parseLine = (tokens) => {
        switch (tokens.peekValue()) {
            case '@': return parseLabel(tokens);
            case 'if': return parseIf(tokens);
            case 'goto': return parseGoto(tokens);
            case 'print': return parsePrint(tokens);
            default: 
                {
                    let expression = parseExpression(tokens);
                    if (tokens.isNext('=')) {
                        tokens.pop();
                        let value = parseExpression(tokens);
                        return { type: "assign", target: expression, value };
                    }
                    return { type: "expr", expression };
                }
        }
    };

    const createParseList = (tokens) => {
        let lines = [];

        let nextAllowed = true;
        while (tokens.popIfPresent('\n')) { }
        while (tokens.hasMore()) {
            if (!nextAllowed) {
                throw new Error("Unexpected token: '" + tokens.peekValue() + "'");
            }
            if (tokens.hasMore()) {
                lines.push(parseLine(tokens));
                nextAllowed = false;
                while (tokens.popIfPresent('\n')) { 
                    nextAllowed = true;
                }
            }
        }
        return lines;
    };

    const handleJsonRequest = async (obj, cb, errCb) => {
        let { files } = obj;
        const tokenizerService = new CTC.Service('simpleTokenizer');
        
        let tokenStreams = (await Promise.all(files.map(({filename, content}) => {
            return tokenizerService.sendJsonRequestAsync({ filename, code: content, options: { newlineControl: true }});
        }))).map(td => {
            return new TokenStream(td.filename, td.values, td.lines, td.cols, "== != <= >=".split(' '))
        });

        if (tokenStreams.length !== 1) return errCb('UNSUPPORTED', "Silly Lang currently only supports compilation of one file."); // Because it is silly.

        let parseList = createParseList(tokenStreams[0]);

        cb({ done: true, parseTree: parseList});
    };

    (typeof(process) === 'undefined' ? window : global).CTC.initializeService("sillylangparse", "0.1.0", {
        handleJsonRequest,
    });

})();
