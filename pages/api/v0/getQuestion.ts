import { NextApiRequest, NextApiResponse } from "next"
import { getServerSession } from "next-auth"
import NextCors from "nextjs-cors"
import prisma from "../../../lib/_utils_server"
import { assertHasAccess, scrubApiKeyPropertyRecursive, scrubHiddenForecastsFromQuestion } from '../../../lib/web/question_router'
import { authOptions } from "../auth/[...nextauth]"

import { getMostRecentForecastForUser } from "../../../lib/_utils_common"

interface Request extends NextApiRequest {
  query: {
    questionId: string
    apiKey?: string
    conciseQuestionDetails?: string
  }
}

const getQuestionPublicApi = async (req: Request, res: NextApiResponse) => {
  // Run the cors middleware
  // nextjs-cors uses the cors package, so we invite you to check the documentation https://github.com/expressjs/cors
  await NextCors(req, res, {
    // Options
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE"],
    origin: req.headers.origin,
    optionsSuccessStatus: 200, // some legacy browsers (IE11, various SmartTVs) choke on 204
  })

  if (req.method === "OPTIONS") {
    return res.status(200).json({})
  }

  if (req.method !== "GET") {
    return res.status(404).json({})
  }

  const { questionId } = req.query
  if (typeof questionId !== "string") {
    return res.status(400).json({
      error:
        `Invalid request. questionId must be a string. ` +
        `Got questionId: ${questionId}`,
    })
  }

  let authedUserId = null
  if (req.query.apiKey) {
    const user = await prisma.user.findFirst({
      where: {
        apiKey: req.query.apiKey,
      },
    })
    if (!user) {
      return res.status(401).json({
        error: `Invalid API key. Check your API key at https://fatebook.io/api-setup`,
      })
    }
    authedUserId = user.id
  } else {
    const session = await getServerSession(req, res, authOptions)
    authedUserId = session?.user.id
  }

  const question = await prisma.question.findUnique({
    where: {
      id: questionId,
    },
    include: {
      user: true,
      forecasts: {
        include: {
          user: true,
        },
      },
      sharedWith: true,
      sharedWithLists: {
        include: {
          author: true,
          users: true,
        },
      },
      questionScores: {
        select: {
          absoluteScore: true,
          relativeScore: true,
          user: {
            select: {
              id: true,
              name: true,
              image: true,
            }
          },
        }
      }
    },
  })

  if (!question) {
    console.log(`question not found: ${questionId}, returning 404`)
    return res.status(404).json({})
  }

  try {
    assertHasAccess({ userId: authedUserId }, question)
  } catch(e) {
    return res.status(401).json({
      message: "You don't have access to that question. Check your API key at https://fatebook.io/api-setup",
    })
  }

  const userName = question!.user.name
  const prediction = getMostRecentForecastForUser(
    question!,
    question!.userId
  )?.forecast

  if (req.query.conciseQuestionDetails) {
    res.status(200).json({
      title: question?.title,
      user: { name: userName },
      prediction,
    })
  } else {
    res.status(200).json(scrubApiKeyPropertyRecursive({
      title: question?.title,
      yourLatestPrediction: prediction,
      resolved: question?.resolved,
      resolution: question?.resolution,
      resolveBy: question?.resolveBy,
      resolvedAt: question?.resolvedAt,
      forecasts: scrubHiddenForecastsFromQuestion(question, authedUserId)?.forecasts.map(f => ({
        forecast: f.forecast.toNumber(),
        createdAt: f.createdAt,
        user: {
          id: f.user.id,
          name: f.user.name,
          image: f.user.image,
        },
      })),
      createdAt: question?.createdAt,
      notes: question?.notes,
      questionScores: question?.questionScores,
    }, ["email", "discordUserId", "unsubscribedFromEmailsAt"]))
  }
}
export default getQuestionPublicApi