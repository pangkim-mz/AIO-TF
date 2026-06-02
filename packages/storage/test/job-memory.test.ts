import { InMemoryJobQueue } from "../src/index";
import { jobQueueContract } from "./job-contract";

jobQueueContract("InMemory", async () => new InMemoryJobQueue());
