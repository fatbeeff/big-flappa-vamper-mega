import { installGmgnCaptureBridge } from "./gmgn-capture-bridge";
import { createLaunchComposer } from "./launch-composer";

const launchComposer = createLaunchComposer();
installGmgnCaptureBridge(launchComposer);
