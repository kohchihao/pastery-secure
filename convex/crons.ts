import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Safety net for any rows whose scheduled cleanup didn't run.
crons.hourly("sweep expired pastes", { minuteUTC: 0 }, internal.pastes.sweepExpired, {});

export default crons;
