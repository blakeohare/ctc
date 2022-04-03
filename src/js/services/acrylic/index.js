(() => {
    
    const handleJsonRequest = async (obj, cb, errCb) => {

        let { files } = obj; // Eventually this service should take in a source path and a disk ID and use a disk service. These will be provided by the cbx-build-router service.

        const acrylicParseService = new CTC.Service('acrylic-parse');
        const cbxEncodeService = new CTC.Service('cbx-encode');
        const cbxRuntimeService = new CTC.Service('cbx-runtime');
        let { ok, err, parseTree } = await acrylicParseService.sendJsonRequestAsync({ files });
        if (ok) {
            let { ok, cbx, err } = await cbxEncodeService.sendJsonRequestAsync({ parseTree });
            if (ok) {
                await cbxRuntimeService.sendJsonRequestAsync({ cbx });
                cb({ done: true });
            } else {
                errCb(err);
            }
        } else {
            errCb(err);
        }
    };

    (typeof(process) === 'undefined' ? window : global).CTC.initializeService("acrylic", "0.1.0", {
        handleJsonRequest,
    });

})();
