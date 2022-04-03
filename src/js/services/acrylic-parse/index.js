(() => {

    const parseError = (token, msg) => {
        throw new Error("[" + token.file + "] line " + token.line + " col " + token.col + ": " + msg);
    };

    const parseErrorEof = (filename, msg) => {
        throw new Error("[" + filename + "]: " + msg);
    };

    const createInternalTokenStream = (filename, values, lines, cols, multicharTokens) => {
        let index = 0;
        let len = values.length;
        let next = null;
        let consolidationMode = true;

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
            if (consolidationMode && mcTokensByFirstChar[next.value] && index + 1 < len) {
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

        let snapshot = () => index;
        let restore = (_index) => { 
            next = null;;
            index = _index; 
        };

        let setConsolidation = (mode) => {
            if (consolidationMode !== mode) {
                next = null;
                consolidationMode = mode;
            }
        };

        return { peek, pop, hasMore: () => index < len, snapshot, restore, setConsolidation };
    };

    const TokenStream = function (filename, values, lines, cols, multicharTokens) {
        let _this = this;
        let stream = createInternalTokenStream(filename, values, lines, cols, multicharTokens);

        _this.peek = () => stream.peek();
        _this.pop = () => stream.pop();
        _this.hasMore = () => stream.hasMore();

        _this.snapshotState = () => stream.snapshot();
        _this.restoreState = (index) => stream.restore(index);
        _this.disableConsolidation  = () => stream.setConsolidation(false);
        _this.enableConsolidation  = () => stream.setConsolidation(true);

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
            if (!next) throw parseErrorEof("Expected '" + value + "' but found <END-OF-FILE>");
            throw parseError(_this.peek(), "Expected '" + value + "' but found '" + next + "'");
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

        let isWord = (str) => {
            let c = str.charAt(0);
            if (c === '_') return true;
            let cc = c.charCodeAt(0);
            if ((cc < charCodes.a || cc > charCodes.z) &&
                (cc < charCodes.A || cc > charCodes.Z)) {
                return false;
            }
            return true;
        };

        _this.isWordNext = () => {
            let t = stream.peek();
            return !!(t && isWord(t.value));
        };

        _this.popWord = () => {
            let t = stream.pop();
            if (!t) throw parseErrorEof(filename, "Unexpected end of file.");
            if (!isWord(t.value)) {
                throw parseError(t, "Expected word but found '" + t.value + "'");
            }
            return t;
        };

        _this.peekValueNonNull = () => {
            let t = stream.peek();
            if (!t) return "end of file";
            return t.value;
        };

        _this.getFile = () => filename;
    };

    const multicharTokens = "== != <= >= += -= *= /= %= ++ -- << >> && || ** ??".split(" ");

    const parseModifiers = (tokens) => {
        let modifiers = [];
        let next = tokens.peekValue();
        while (true) {
            switch (next) {
                case "private":
                case "public":
                case "static":
                case "internal":
                    modifiers.push(tokens.pop());
                    break;
                default:
                    return modifiers;
            }
        }
    };

    const parseType = (tokens) => {
        let t = tryParseType(tokens);
        if (!t) throw tokens.hasMore()
            ? parseError(t, "Expected a type")
            : parseErrorEof(tokens.getFile(), "Expected a type but found end of file");
        return t;
    };

    const tryParseType = (tokens) => {
        let tokenIndex = tokens.snapshotState();
        tokens.disableConsolidation();
        let type = tryParseTypeImpl(tokens);
        tokens.enableConsolidation();
        if (!type) {
            tokens.restoreState(tokenIndex);
            return null;
        }
        return type;
    };

    const newType = (rootTokenChain, optGenerics) => {
        let generics = optGenerics || [];
        return { 
            firstToken: rootTokenChain[0],
            root: rootTokenChain, 
            isArray: false,
            generics, 
            hasGenerics: generics.length > 0, 
            rootStr: rootTokenChain.map(t => t.value).join('.'),
        };
    };

    const primitiveTypes = new Set("bool int float long char string void any auto".split(" "));
    const tryParseTypeImpl = (tokens) => {
        if (!tokens.hasMore()) return null;
        let next = tokens.peekValue();
        let typeChain = [tokens.pop()];
        let isPrimitive = primitiveTypes.has(next);
        if (!isPrimitive) {
            while (tokens.isNext('.')) {
                let state = tokens.snapshotState();
                tokens.pop();
                if (tokens.isWordNext()) {
                    typeChain.push(tokens.pop());
                } else {
                    tokens.restoreState(state);
                    return newType(typeChain);
                }
            }
        }

        let generics = [];
        if (!isPrimitive && tokens.isNext('<')) {
            let state = tokens.snapshotState();
            tokens.pop();
            let gen1 = tryParseTypeImpl(tokens);
            if (!gen1) {
                tokens.restoreState(state);
            } else {
                generics.push(gen1);
                while (tokens.popIfPresent(',')) {
                    let nextGen = tryParseTypeImpl(tokens);
                    if (nextGen) {
                        generics.push(nextGen);
                    } else {
                        generics = [];
                        tokens.restoreState(state);
                        break;
                    }
                }

                if (!tokens.popIfPresent('>')) {
                    generics = [];
                    tokens.restoreState(state);
                }
            }
        }

        let output = newType(typeChain, generics);
        while (tokens.isNext('[')) {
            let state = tokens.snapshotState();
            let open = tokens.pop();
            if (tokens.isNext(']')) {
                let close = tokens.pop();
                output = newType([open, close], [output]);
                output.isArray = true;
                output.firstToken = output.generics[0].firstToken;
            } else {
                tokens.restoreState(state);
                break;
            }
        }
        return output;
    };

    const parseCodeBlock = (tokens) => {
        throw new Error("Not implemented");
    };

    const parseTopLevelEntities = (tokens) => {
        let entities = [];
        while (tokens.hasMore()) {
            let modifiers = parseModifiers(tokens);
            let next = tokens.peekValue();
            switch (next) {
                case "class": throw new Error("Not implemented");
                default:
                    {
                        let type = tryParseType(tokens);
                        if (type === null) return tokens.throwUnexpected();
                        let func = parseFunction(tokens, modifiers, type);
                        entities.push(func);
                    }
                    break;
            }
        }
    };

    const newFunction = (modifiers, type, name, argNames, argTypes, code) => {
        let visibility = null;
        let isStatic = null;
        throw new Error("Not implemented");
    };

    const parseFunction = (tokens, modifiers, type) => {
        let name = tokens.popWord();
        let argNames = [];
        let argTypes = [];
        tokens.popExpected('(');
        while (!tokens.popIfPresent(')')) {
            if (argNames.length) tokens.popExpected(',');
            argTypes.push(parseType(tokens));
            argNames.push(tokens.popWord());
        }
        let code = parseCodeBlock(tokens);
        return newFunction(modifieres, type, name, argNames, argTypes, code);
    };

    const parseRoot = async (ctx, tokens) => {
        //try {
            // TODO: parse out imports.
            let entities = parseTopLevelEntities(tokens);
            ctx.push(...entities);
        //} catch (e) {
        //    ctx.errors.push(e);
        //}
    };

    const resolve = (ctx) => {
        throw new Error("Not implemented");
    };

    const toExportFormat = (ctx) => {
        throw new Error("Not implemented");
    };

    const handleJsonRequest = async (obj, cb, _ /* always use cb */) => {

        let { files } = obj;

        const tokenizerService = new CTC.Service('simpleTokenizer');
        
        let tokenStreams = (await Promise.all(files.map(({filename, content}) => {
            return tokenizerService.sendJsonRequestAsync({ filename, code: content, options: { newlineControl: true }});
        }))).map(td => {
            return new TokenStream(td.file, td.values, td.lines, td.cols, multicharTokens);
        });

        let ctx = {
            entities: [],
            errors: [],
            warnings: [],
        };

        for (const tokens of tokenStreams) {
            parseRoot(ctx, tokens);
        }

        if (ctx.errors.length) return cb({ ok: true, errors: ctx.errors, warnings: ctx.warnings });
        resolve(ctx);

        let output = toExportFormat(ctx);

        if (ctx.errors.length) return cb({ ok: true, errors: ctx.errors, warnings: ctx.warnings });

        cb({ entities: output.entities, errors: [], warnings: ctx.warnings });
    };

    (typeof(process) === 'undefined' ? window : global).CTC.initializeService("acrylic-parse", "0.1.0", {
        handleJsonRequest,
    });

})();
