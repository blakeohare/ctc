require("./ctc");
require("./services/simpleTokenizer");
require("./services/sillyLang");

let code = `



n = 1
@COUNT_UP
if n > 10 goto @READY
    print n + " Mississippi"
    n = n + 1
goto @COUNT_UP

@READY
print "Ready or not, here I come!"




`;

let SillyLang = new CTC.Service('sillylang');

(async () => {

    let result = await SillyLang.sendJsonRequestAsync({
        files: [
            { filename: "main.slang", content: code }
        ],
    })

    console.log(result);

})();


