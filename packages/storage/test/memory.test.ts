import { InMemoryRepository } from "../src/index";
import { repositoryContract } from "./contract";

repositoryContract("InMemory", async () => new InMemoryRepository());
