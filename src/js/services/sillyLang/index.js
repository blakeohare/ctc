(() => {
    
    const handleJsonRequest = async (obj, cb, errCb) => {

        let { files } = obj;
        const slangParserService = new CTC.Service('sillylangparse');
        const slangRunnerService = new CTC.Service('sillylangruntime');
        let { parseTree } = await slangParserService.sendJsonRequestAsync({ files });
        
        await slangRunnerService.sendJsonRequestAsync({ parseTreeLegacy: parseTree });
        cb({ done: true });
    };

    (typeof(process) === 'undefined' ? window : global).CTC.initializeService("sillylang", "0.1.0", {
        handleJsonRequest,
    });

})();
