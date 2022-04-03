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

    const multicharTokens = "== != <= >= += -= *= /= %= ++ -- << >> && || ** ??".split(" ");

    const parseRoot = (ctx, tokens) => {
        throw new Error("Not implemented");
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
            return new TokenStream(td.filename, td.values, td.lines, td.cols, multicharTokens);
        });

        let ctx = {
            entities: [],
            errors: [],
            warnings: [],
        };

        for (const tokens of tokenStreams) {
            parseRoot(ctx, tokens);
        }

        if (errors.length) return cb({ ok: true, errors: ctx.errors, warnings: ctx.warnings });
        resolve(ctx);

        let output = toExportFormat(ctx);

        if (errors.length) return cb({ ok: true, errors: ctx.errors, warnings: ctx.warnings });

        cb({ entities: output.entities, errors: [], warnings: ctx.warnings });
    };

    (typeof(process) === 'undefined' ? window : global).CTC.initializeService("acrylic-parse", "0.1.0", {
        handleJsonRequest,
    });

})();
