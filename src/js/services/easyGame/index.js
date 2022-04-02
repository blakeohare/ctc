

(typeof(process) === 'undefined' ? window : global).EasyGame = (() => {

    let screen = null;
    let screenCtx = null;

    const initSurface = (canvas) => {
        screen = canvas;
        screenCtx = canvas.getContext('2d');
    };

    const initGame = (width, height) => {
        screen.width = width;
        screen.height = height;
        screen.style.width = width + 'px';
        screen.style.height = height + 'px';
        screenCtx = screen.getContext('2d');
        screenCtx.fillStyle = '#000000';
        screenCtx.fillRect(0, 0, width, height);
    };

    const HEX = '0123456789abcdef'.split("");

    const drawRect = (x, y, width, height, r, g, b) => {
        screenCtx.fillStyle = ['#',
            HEX[(r & 255) >> 4],
            HEX[r & 15],
            HEX[(g & 255) >> 4],
            HEX[g & 15],
            HEX[(b & 255) >> 4],
            HEX[b & 15],
        ].join("");
        
        screenCtx.fillRect(x, y, width, height);
    };

    const handleStringRequest = (str, cb, errCb) => {
        let parts = str.split(',');
        let cmd = parts[0];
        let args = [];
        for (let i = 1; i < parts.length; i++) {
            args.push(parseInt(parts[i]));
        }
        switch (cmd) {
            case 'INIT': cb(initGame(args[0], args[1])); break;
            case 'RECT': cb(drawRect(args[0], args[1], args[2], args[3], args[4], args[5], args[6]));
            default: return errCb('BAD_REQUEST', "Unknown command: " + cmd);
        }
    };

    const handleSubscriptionRequest = (str, cb, errCb) => {
        throw new Error("TODO: handle subscription request");
    };

    (typeof(process) === 'undefined' ? window : global).CTC.initializeService("easyGame", "0.1.0", {
        handleStringRequest,
    });
    
    return {
        initSurface,
    };

})();
