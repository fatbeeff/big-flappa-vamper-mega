import { installGmgnCaptureBridge } from "./gmgn-capture-bridge";
import { createGmgnSourceTokenAdapter } from "./gmgn-source-token";
import { createLaunchComposer } from "./launch-composer";
import { installFlapTaxInspector } from "./flap-tax-inspector";
import { installLongAuthenticityInspector } from "./long-authenticity-inspector";
import { createPonsLaunchComposer } from "./pons-launch-composer";

const launchComposer = createLaunchComposer();
const ponsLaunchComposer = createPonsLaunchComposer();
const sourceTokenAdapter = createGmgnSourceTokenAdapter();
installGmgnCaptureBridge(launchComposer, ponsLaunchComposer, sourceTokenAdapter);
installFlapTaxInspector();
installLongAuthenticityInspector();
