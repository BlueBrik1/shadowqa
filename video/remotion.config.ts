import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.setConcurrency(4);
Config.setCodec("h264");
Config.setCrf(17);
Config.setChromiumOpenGlRenderer("angle");
Config.setEntryPoint("src/index.ts");
