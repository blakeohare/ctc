(() => {

    const wrapValue = (value) => {
        if (value === undefined || value === null) return { type: 'null' };
        switch (typeof value) {
            case 'number': return { type: (value % 1 === 0) ? 'int' : 'float', value };
            case 'boolean': return { type: 'bool', value: value };
        }
        
        throw new Error("No conversion for value: " + value);
    };

    const invokeFunction = async (func, args) => {
        if (func.argCount !== args.length) throw new Error("Invalid argument count. Expected " + func.argCount + " but recceived " + args.length);
        let nativeArgs = [];
        for (let i = 0; i < func.argTypes.length; i++) {
            let arg = args[i];
            let expectedType = func.argTypes[i];
            let ok = false;
            if (arg.type === expectedType) {
                ok = true;
            }

            if (!ok) throw new Error("Expected " + expectedType + " for argument #" + (i + 1) + " but found " + arg.type + ".");
            nativeArgs.push(arg.value);
        }

        switch (func.type) {
            case "nativeFunction":
                let pval = func.value.call(null, ...nativeArgs);
                let val = await Promise.resolve(pval);
                return wrapValue(val);

            default:
                console.log(func);
                throw new Error("TODO");
        }
    };

    const runExpressions = async (expressions, vars) => {
        let values = [];
        for (let expr of expressions) {
            values.push(await runExpression(expr, vars));
        }
        return values;
    };

    const SYSTEM_FUNCTIONS = {
        currentTime: { type: 'nativeFunction', value: () => new Date().getTime() / 1000.0, argCount: 0, argTypes: [] },
        pause: { type: 'nativeFunction', value: (delay) => {
            return new Promise((res) => {
                setTimeout(() => res(null), Math.floor(delay * 1000));
            });
        }, argCount: 1, argTypes: ['float'] },
    };

    const getSysFuncValue = (name) => {
        let fn = SYSTEM_FUNCTIONS[name];
        if (fn) return fn;
        throw new Error("Unknown system function: $" + name);
    };

    const runExpression = async (expr, vars) => {
        if (!expr) {
            throw new Error();
        }
        switch (expr.type) {
            case 'integer': return { type: 'int', value: expr.value };
            case 'float': return { type: 'float', value: expr.value };
            case 'string': return { type: 'string', value: expr.value };
            case 'bool': return { type: 'bool', value: expr.value };
            case 'null': return { type: 'null', value: null };
            case 'sysFunc': return getSysFuncValue(expr.name);

            case 'variable':
                if (!vars[expr.name]) throw new Error("Variable is not defined: " + expr.name);
                return vars[expr.name];

            case 'ops':
                {
                    let expressions = await runExpressions(expr.expressions, vars);
                    let left = expressions[0]; // accumulator
                    for (let i = 0; i < expr.ops.length; i++) {
                        let op = expr.ops[i].value;
                        let right = expressions[i + 1];
                        let signature = left.type + op + right.type;
                        switch (signature) {
                            case 'int+int': left = { type: 'int', value: left.value + right.value }; break;
                            case 'int-int': left = { type: 'int', value: left.value - right.value }; break;
                            case 'int*int': left = { type: 'int', value: left.value * right.value }; break;
                            case 'int/int': if (right.value === 0) throw new Error("Division by 0"); left = { type: 'int', value: Math.floor(left.value / right.value) }; break;
                            case 'int%int': if (right.value === 0) throw new Error("Division by 0"); left = { type: 'int', value: Math.floor(left.value % right.value) }; break;

                            case 'int+float': left = { type: 'float', value: left.value + right.value }; break;
                            case 'int-float': left = { type: 'float', value: left.value - right.value }; break;
                            case 'int*float': left = { type: 'float', value: left.value * right.value }; break;
                            case 'int/float': if (right.value === 0) throw new Error("Division by 0"); left = { type: 'float', value: left.value / right.value }; break;
                            case 'int%float': if (right.value === 0) throw new Error("Division by 0"); left = { type: 'float', value: left.value % right.value }; break;

                            case 'float+int': left = { type: 'float', value: left.value + right.value }; break;
                            case 'float-int': left = { type: 'float', value: left.value - right.value }; break;
                            case 'float*int': left = { type: 'float', value: left.value * right.value }; break;
                            case 'float/int': if (right.value === 0) throw new Error("Division by 0"); left = { type: 'float', value: left.value / right.value }; break;
                            case 'float%int': if (right.value === 0) throw new Error("Division by 0"); left = { type: 'float', value: left.value % right.value }; break;

                            case 'float+float': left = { type: 'float', value: left.value + right.value }; break;
                            case 'float-float': left = { type: 'float', value: left.value - right.value }; break;
                            case 'float*float': left = { type: 'float', value: left.value * right.value }; break;
                            case 'float/float': if (right.value === 0) throw new Error("Division by 0"); left = { type: 'float', value: left.value / right.value }; break;
                            case 'float%float': if (right.value === 0) throw new Error("Division by 0"); left = { type: 'float', value: left.value % right.value }; break;

                            case 'int<int': case 'int<float': case 'float<int': case 'float<float': left = { type: 'bool', value: left.value < right.value }; break;
                            case 'int>int': case 'int>float': case 'float>int': case 'float>float': left = { type: 'bool', value: left.value > right.value }; break;
                            case 'int<=int': case 'int<=float': case 'float<=int': case 'float<=float': left = { type: 'bool', value: left.value <= right.value }; break;
                            case 'int>=int': case 'int>=float': case 'float>=int': case 'float>=float': left = { type: 'bool', value: left.value >= right.value }; break;

                            default:
                                if (op === '+' && (left.type === 'string' || right.type === 'string')) {
                                    left = { type: 'string', value: left.value + "" + right.value };
                                } else {
                                    throw new Error("Not implemented: " + signature);
                                }
                                break;
                        }
                    }
                    return left;
                }

            case 'CTC':
                return { type: 'CTC' };
            
            case 'field':
                {
                    let root = await runExpression(expr.root, vars);
                    let fieldName = expr.name;
                    switch (root.type) {
                        case 'CTC': return { type: 'CTCService', name: fieldName, service: new CTC.Service(fieldName) };
                        case 'CTCService':
                            switch (fieldName) {
                                case 'sendString': 
                                    return { 
                                        type: 'nativeFunction', 
                                        value: s => root.service.sendStringRequestAsync(s + ''),
                                        argCount: 1,
                                        argTypes: ['string'],
                                    };
                            }
                            break;
                    }
                }
                throw new Error("Unknown field: ." + fieldName);

            case 'invoke':
                {
                    let func = await runExpression(expr.root, vars);
                    let args = await runExpressions(expr.args, vars);
                    return await invokeFunction(func, args);
                }

            default: 
                throw new Error(expr.type);
        }
    };

    const runCode = async (parseList) => {        
        let labelLookup = {};
        parseList.forEach((line, index) => {
            if (line.type === 'label') labelLookup[line.label] = index;
        });

        let items = parseList.map(item => item.type === 'label' ? null : item);
        let variables = new Map();
        let pc = 0;
        let len = items.length;
        while (pc < len) {
            let line = items[pc];
            if (line) {
                switch (line.type) {
                    case 'assign':
                        {
                            const { target, value } = line;
                            let exprValue = await runExpression(value, variables);

                            switch (target.type) {
                                case 'variable':
                                    variables[target.name] = exprValue;
                                    break;
                                default: throw new Error("Assignment not supported for this type."); // TODO: move this into the parser
                            }
                        }
                        break;
                    case 'if':
                        {
                            const { condition, trueGoto, falseGoto } = line;
                            let exprValue = await runExpression(condition, variables);
                            if (exprValue.type !== 'bool') throw new Error("Only booleans may be used as the condition of if statements.");
                            let gotoTarget = exprValue.value ? trueGoto : falseGoto;
                            if (gotoTarget) {
                                let newPc = labelLookup[gotoTarget];
                                if (newPc === undefined) throw new Error("Label not found: " + gotoTarget);
                                pc = newPc - 1;
                            }
                        }
                        break;
                    
                    case 'goto':
                        {
                            let newPc = labelLookup[line.label];
                            if (newPc === undefined) throw new Error("Label not found: " + line.label);
                            pc = newPc - 1;
                        }
                        break;

                    case 'print':
                        {
                            let value = await runExpression(line.expression, variables);
                            console.log(value.value);
                        }
                        break;
                    
                    case 'expr':
                        await runExpression(line.expression, variables);
                        break;

                    default:
                        throw new Error("Not implemented: " + line.type);
                }
            }
            pc++;
        }
    };

    const handleJsonRequest = async (obj, cb, errCb) => {
        let { parseTreeLegacy } = obj;
        await runCode(parseTreeLegacy);
        cb({ done: true, stdOut: [], stdErr: [] });
    };

    (typeof(process) === 'undefined' ? window : global).CTC.initializeService("sillylangruntime", "0.1.0", {
        handleJsonRequest,
    });

})();
