import { installGmgnCaptureBridge } from "./gmgn-capture-bridge";
import { createGmgnSourceTokenAdapter } from "./gmgn-source-token";
import { createLaunchComposer } from "./launch-composer";
import { createSourceTokenContractResolver } from "./source-token-contract-resolver";

const launchComposer = createLaunchComposer();
const sourceTokenAdapter = createGmgnSourceTokenAdapter(createSourceTokenContractResolver());
installGmgnCaptureBridge(launchComposer, sourceTokenAdapter);
