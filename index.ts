import Instructor from "@instructor-ai/instructor"
import OpenAI from "openai"
import { z } from "zod"

const oai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? undefined,
  organization: process.env.OPENAI_ORG_ID ?? undefined
})

const client = Instructor({
  client: oai,
  mode: "TOOLS"
})

const StorySchema = z.object({
  title: z
    .string()
    .describe(
      "The title of the HN story. If it's a hiring story, it should be in the classic HN format"
    ),
  username: z.string().describe("The username of the author"),
  domain: z.string().describe("The domain of the story"),
  type: z.enum(["show", "jobs", "ask", "story"]).describe("The type of story"),
  points: z.number()
})

const StoriesSchema = z.object({ stories: z.array(StorySchema) })

const CommentSchema = z.object({
  id: z.string().describe("The numeric comment id. It should be numeric"),
  reply_to_id: z.string().optional().describe("The numeric id of the comment id this replies to"),
  username: z.string().describe("The username of the author"),
  comment: z.string().describe("The comment text")
})

const CommentsSchema = z.object({
  comments: z.array(CommentSchema)
})

type Story = z.infer<typeof StorySchema> & { id: string }
type Comment = z.infer<typeof CommentSchema>

async function complete(prompt, schema) {
  const stream = await client.chat.completions.create({
    messages: [
      {
        role: "system",
        content: "You are a helpful assistant that writes creative HN (Hacker News) story titles"
      }
    ],
    model: "gpt-4",
    response_model: {
      schema: schema,
      name: "value extraction"
    },
    max_retries: 3,
    stream: true
  })

  return stream
}

const storiesObj: { stories: Story[]; comments: Record<string, Comment> } = {
  stories: [],
  comments: {}
}

async function getComments(story, id) {
  const commentsStream = await complete(
    `Generate a hacker news comment tree with 100+ comments, replies and usernames for the topic: ${story.title}. Make the comments as realistic and comprehensive as possible
      `,
    CommentsSchema
  )

  for await (const result of commentsStream) {
    try {
      console.log(result.comments)
      storiesObj.comments[id] = result.comments

      console.clear()
      console.table(storiesObj.stories)
      console.table(storiesObj.comments)
    } catch (e) {
      console.log(e)
      break
    }
  }
}

async function main() {
  const storiesStream = await complete(
    `give me 5 hacker news (HN) stories. 
      Follow the following instructions accurately:
      - Make the titles as realistic as possible.
      - If the story is in the first person and showing some work, prefix it with Show HN:
      - If the story is a question, prefix it with Ask HN:
      - If the story is about hiring, use the HN format for example '{Company} (YC {Season}) is hiring {Role}'. Replace the {} variables with creative values
      - Most titles should not be in the first person, and should not be prefixed.
      - NEVER include a prefix like "Prefix:" for jobs and hiring titles
      - Only include at most 1 show, 1 ask and 1 hiring title
      `,
    StoriesSchema
  )

  let lastCompletedStoryIndex: number | null = null

  for await (const result of storiesStream) {
    try {
      storiesObj.stories = result.stories

      console.clear()
      console.table(storiesObj.stories)
      console.table(storiesObj.comments)

      if (
        storiesObj.stories.length > 0 &&
        lastCompletedStoryIndex !== storiesObj.stories.length - 1
      ) {
        lastCompletedStoryIndex = storiesObj.stories.length - 1
        console.log("Last completed story index", lastCompletedStoryIndex)

        getComments(storiesObj.stories[lastCompletedStoryIndex], lastCompletedStoryIndex)
      }
    } catch (e) {
      console.log(e)
      break
    }
  }
}

main()
