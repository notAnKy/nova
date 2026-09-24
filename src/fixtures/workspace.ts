// Phase 1 presentation data. Replace this module with authorized queries in later phases.
export type Workspace = {
  id: string;
  name: string;
  initials: string;
  color: string;
};

export type Person = {
  id: string;
  name: string;
  initials: string;
  color: string;
  online: boolean;
};

export type Conversation = {
  id: string;
  name: string;
  kind: "public" | "private" | "dm";
  topic: string;
  members: number;
  unread?: number;
  personId?: string;
};

export type Message = {
  id: string;
  authorId: string;
  time: string;
  body: string[];
  code?: string;
  link?: { label: string; href: string };
  reactions?: { emoji: string; count: number }[];
  replies?: number;
  threadLabel?: string;
};

export const workspaces: Workspace[] = [
  { id: "nova", name: "Nova Studio", initials: "N", color: "violet" },
  { id: "orbit", name: "Orbit Club", initials: "O", color: "coral" },
];

export const people: Person[] = [
  { id: "mira", name: "Mira Chen", initials: "MC", color: "rose", online: true },
  { id: "sarah", name: "Sarah Kim", initials: "SK", color: "amber", online: true },
  { id: "alex", name: "Alex Rivera", initials: "AR", color: "blue", online: false },
  { id: "youssef", name: "Youssef Ben Ali", initials: "YA", color: "teal", online: true },
  { id: "me", name: "You", initials: "JD", color: "violet", online: true },
];

export const conversations: Conversation[] = [
  { id: "general", name: "general", kind: "public", topic: "Studio-wide updates and good questions", members: 12 },
  { id: "game-dev", name: "game-dev", kind: "public", topic: "Building Northstar, one good playtest at a time", members: 8, unread: 3 },
  { id: "engineering", name: "engineering", kind: "public", topic: "Architecture, builds, and the occasional mystery bug", members: 6, unread: 2 },
  { id: "design", name: "design", kind: "public", topic: "Visual direction, interaction, and tiny details", members: 5 },
  { id: "random", name: "random", kind: "public", topic: "The useful and the wonderfully off-topic", members: 12 },
  { id: "founders", name: "founders", kind: "private", topic: "Planning and sensitive studio conversations", members: 3 },
  { id: "sarah-dm", name: "Sarah Kim", kind: "dm", topic: "Your conversation with Sarah", members: 2, personId: "sarah", unread: 1 },
  { id: "alex-dm", name: "Alex Rivera", kind: "dm", topic: "Your conversation with Alex", members: 2, personId: "alex" },
  { id: "youssef-dm", name: "Youssef Ben Ali", kind: "dm", topic: "Your conversation with Youssef", members: 2, personId: "youssef" },
];

export const messagesByConversation: Record<string, Message[]> = {
  "game-dev": [
    {
      id: "m1", authorId: "mira", time: "9:14 AM",
      body: ["Morning! The new Northstar build is ready for a quick playtest. I tightened the first five minutes so the objective lands sooner.", "If you have 15 minutes today, try the opening without reading the design notes first."],
      reactions: [{ emoji: "🚀", count: 4 }, { emoji: "👀", count: 2 }],
      replies: 4, threadLabel: "Sarah and 2 others replied",
    },
    {
      id: "m2", authorId: "alex", time: "9:28 AM",
      body: ["Played through twice. The new beacon is much easier to spot. One thing: the interaction hint disappears if I approach from the west side."],
      reactions: [{ emoji: "👍", count: 2 }], replies: 2, threadLabel: "2 replies",
    },
    {
      id: "m3", authorId: "youssef", time: "10:02 AM",
      body: ["Found it. The visibility check was using the camera position instead of the player position. Small fix is in the branch now:"],
      code: "fix/beacon-interaction-cone",
      reactions: [{ emoji: "🙌", count: 3 }],
    },
    {
      id: "m4", authorId: "sarah", time: "10:19 AM",
      body: ["Nice catch. I added a note to the playtest sheet so we can compare both routes tomorrow. The quieter audio cue is working really well, by the way."],
      reactions: [{ emoji: "✨", count: 2 }],
    },
    {
      id: "m5", authorId: "mira", time: "11:06 AM",
      body: ["Thanks, everyone. Let’s keep feedback in this thread until the review at 3. I’ll post a short list of decisions afterward so nobody has to reconstruct them from chat."],
      replies: 1, threadLabel: "1 reply",
    },
  ],
  general: [
    { id: "g1", authorId: "mira", time: "Yesterday, 4:32 PM", body: ["Welcome to Nova Studio. This is the place for updates that everyone should see. Project conversations live in their own channels so the important bits stay easy to find."], reactions: [{ emoji: "👋", count: 6 }] },
    { id: "g2", authorId: "sarah", time: "9:06 AM", body: ["Today’s check-in is at 3 PM. Bring one thing you learned from the latest Northstar playtest and one question for the team."] },
  ],
  engineering: [
    { id: "e1", authorId: "youssef", time: "Yesterday, 2:17 PM", body: ["The build pipeline is green again. I separated the asset validation step so a failed texture import is easier to spot."], code: "pnpm build && pnpm test:smoke", reactions: [{ emoji: "✅", count: 3 }] },
    { id: "e2", authorId: "alex", time: "10:44 AM", body: ["I’ll check the controller mapping after lunch. The new input prompt should follow the active device rather than whichever device connected first.", "The Godot input guide has a good example for detecting the event source."], link: { label: "Read the input event guide", href: "https://docs.godotengine.org/en/stable/tutorials/inputs/inputevent.html" } },
  ],
  design: [
    { id: "d1", authorId: "sarah", time: "Yesterday, 11:20 AM", body: ["I put the updated beacon icon in the review folder. The shape reads better at small sizes and doesn’t compete with the objective marker."], reactions: [{ emoji: "💜", count: 3 }] },
  ],
  random: [
    { id: "r1", authorId: "alex", time: "Friday, 5:41 PM", body: ["Small victory: my desk plant survived another sprint. I think it deserves an honorary producer credit."], reactions: [{ emoji: "🌱", count: 5 }] },
  ],
  founders: [],
  "sarah-dm": [
    { id: "sd1", authorId: "sarah", time: "10:35 AM", body: ["Hey! Could you take a look at the new onboarding copy when you have a moment? I want the first screen to feel helpful, not like a tutorial wall."] },
    { id: "sd2", authorId: "me", time: "10:42 AM", body: ["Absolutely. Send me the latest draft and I’ll leave notes before the review."] },
  ],
  "alex-dm": [],
  "youssef-dm": [],
};

export const sampleThread: Message[] = [
  messagesByConversation["game-dev"][0],
  { id: "t1", authorId: "sarah", time: "9:19 AM", body: ["I can do a fresh-eyes run. I’ll record where I pause or second-guess the objective."] },
  { id: "t2", authorId: "youssef", time: "9:23 AM", body: ["I’ll watch the telemetry for the first area. We should know if the earlier prompt changes the route people take."] },
];

export function personById(id: string): Person {
  return people.find((person) => person.id === id) ?? people[0];
}
