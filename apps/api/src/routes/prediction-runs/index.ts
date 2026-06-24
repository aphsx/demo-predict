import Elysia from "elysia";
import { runsRoutes } from "./runs";
import { outputsRoutes } from "./outputs";
import { summaryRoutes } from "./summary";
import { customer360Routes } from "./customer-360";
import { insightRoutes } from "./insight";

export const predictionRunRoutes = new Elysia({ prefix: "/prediction-runs" })
  .use(runsRoutes)
  .use(outputsRoutes)
  .use(summaryRoutes)
  .use(customer360Routes)
  .use(insightRoutes);
