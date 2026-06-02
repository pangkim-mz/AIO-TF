import { InMemoryTokenStore } from "../src/index";
import { tokenStoreContract } from "./token-contract";

tokenStoreContract("InMemory", async () => new InMemoryTokenStore());
