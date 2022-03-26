const CTC = (() => {

    const services = new Map();

    const versionComparison = (a, b) => {
        if (a === b) return 0;
        let aParts = a.split('.');
        let bParts = b.split('.');
        while (aParts.length && parseInt(aParts[aParts.length - 1]) === 0) aParts.pop();
        while (bParts.length && parseInt(bParts[bParts.length - 1]) === 0) bParts.pop();

        for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
            let aPiece = parseInt(aParts[i] || '0');
            let bPiece = parseInt(bParts[i] || '0');
            if (aPiece !== bPiece) return aPiece < bPiece ? -1 : 1;
        }
        
        return aParts.length < bParts.length ? -1 : 1;
    };

    const initializeService = (serviceId, ver, service) => {
        let serviceByVersion;
        if (!services.has(serviceId)) {
            serviceByVersion = {};
            serviceByVersion["*"] = { ver, service };
            services.set(serviceId, serviceByVersion);
        }
        serviceByVersion = services.get(serviceId);
        serviceByVersion[ver] = { ver, service };

        if (versionComparison(ver, serviceByVersion["*"].ver) === 1) {
            serviceByVersion["*"] = { ver, service };
        }
    };

    const Service = function(serviceId, version) {
        let label = serviceId;
        if (version) label += " (" + version + ")";
        let _this = this;
        let service = null;
        let getServiceImpl = () => {
            if (!services.has(serviceId)) return null;
            let serviceLookup = services.get(serviceId);
            if (!version) version = "*";
            let t = serviceLookup[version] || null;
            if (t) return t.service;
            return null;
        };

        let getService = () => {
            if (!service) {
                service = getServiceImpl();
                if (!service) throw new Error("Service not found: " + serviceId + (version ? ` (${version})` : ""));
            }
            return service;
        };

        let defaultErrCb = (code, msg) => { 
            throw new Error(`Error in ${label}! ${code}: ${msg}`); 
        };

        _this.sendStringRequest = (str, cb, errCb) => {
            getService().handleRequest('S', str, cb, errCb || defaultErrCb);
        };

        _this.sendStringRequestAsync = (str) => {
            let p = new Promise((res, rej) => {
                getService().handleRequest('S', str, response => {
                    res(response);
                }, defaultErrCb);
            });
            return p;
        };

        _this.sendJsonRequest = (obj, cb, errCb) => {
            getService().handleRequest('J', JSON.stringify(obj), res => {
                cb(JSON.parse(res));
            }, errCb || defaultErrCb);
        };

        _this.sendJsonRequestAsync = (obj) => {
            let p = new Promise(resolver => {
                getService().handleRequest('J', JSON.stringify(obj), res => {
                    resolver(JSON.parse(JSON.stringify(res)));
                }, defaultErrCb);
            });
            return p;
        };

        _this.sendStringSubscriptionRequest = (str, cb, errCb) => {
            getService().handleRequest('U', str, cb, errCb || defaultErrCb);
        };
    }

    let ctc = {
        initializeService,
        Service,
    };
    Object.freeze(ctc);
    return ctc;
})();
