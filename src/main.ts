import { App } from "./app";

const canvas = document.getElementById("app") as HTMLCanvasElement;
const app = new App(canvas);
app.start();
