(() => {
    
    const handleJsonRequest = async (obj, cb, errCb) => {
        throw new Error("Not implemented");
    };

    (typeof(process) === 'undefined' ? window : global).CTC.initializeService("cbx-encode", "0.1.0", {
        handleJsonRequest,
    });

})();
