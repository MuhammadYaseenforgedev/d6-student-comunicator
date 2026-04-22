import type { Message } from "../models/message";

// In-memory store for Week 1/2.
// Later we swap this to a DB repo with the same interface.
export const messages: Message[] = [];
