import { installGmgnCaptureBridge } from "./gmgn-capture-bridge";
import { createGmgnSourceTokenAdapter } from "./gmgn-source-token";
import { createLaunchComposer } from "./launch-composer";
import { createSourceTokenContractResolver } from "./source-token-contract-resolver";
import { installFlapTaxInspector } from "./flap-tax-inspector";
import { installLongAuthenticityInspector } from "./long-authenticity-inspector";

const launchComposer = createLaunchComposer();
const sourceTokenAdapter = createGmgnSourceTokenAdapter(createSourceTokenContractResolver());
installGmgnCaptureBridge(launchComposer, sourceTokenAdapter);
installFlapTaxInspector();
installLongAuthenticityInspector();
