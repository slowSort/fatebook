import { GroupType, PrismaClient, Profile, Forecast } from '@prisma/client'
import { ModalView } from '@slack/types'
import { QuestionWithForecasts } from '../prisma/additional'
import fetch from 'node-fetch'

import { Blocks } from './blocks-designs/_block_utils.js'
import { token, maxDecmialPlaces } from './_constants.js'

const prisma = new PrismaClient()
export default prisma

// tokenize a string into an array by splitting on sections
// in the following syntax, with two strings and one number:
// "forecast" "date" 0.8
export function tokenizeForecastString(instring : string) : string[] | null {
  const regex = /([a-zA-Z_]+)\s?(["“][^"”]*["”])?\s?("?[^"\s]*"?)?\s?([\d.]*)?/
  const array : string[] | null = instring.match(regex)
  console.log('Tokenized version:', array)
  return array
}

export async function getSlackWorkspaceName() {
  try {
    const url = 'https://slack.com/api/team.info'
    const response = await fetch(url, {
      method: 'get',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${token}`,
      }
    })
    const data = await response.json()
    console.log('data from team fetch:', data)
    return (data as any).team.name
  } catch (err) {
    console.log('fetch email Error:', err)
    throw err
  }
}

export async function getSlackProfileFromSlackId(slackId : string) {
  let data
  try {
    const url = 'https://slack.com/api/users.info'
    const response = await fetch(url+`?user=${slackId}`, {
      method: 'get',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${token}`,
      }
    })
    data = await response.json()
    console.log('data from user fetch:', data)
  } catch (err) {
    console.log('fetch email Error:', err)
    throw err
  }

  const slackProfile = (data as any).user.profile
  if( slackProfile === undefined) {
    throw new Error('slackProfile not found')
  }
  console.log('slackUser found:', slackProfile)
  return slackProfile
}

export async function getOrCreateProfile(slackUserId: string, groupId: number) {
  // query the database for the user
  //   we use findFirst because we expect only one result
  //   cannot get unique because we don't have a unique on
  //   uncertain field
  let profile = await prisma.profile.findFirst({
    where: {
      slackId: slackUserId
    },
  })

  // if no profile, create one
  if(!profile) {
    try{
      profile = await createProfile(slackUserId, groupId)
    } catch(err) {
      console.error(`Couldn't create userID or group for slackUserID: ${slackUserId}`)
      throw new Error(`Couldn't create profile for slackUserId: ${slackUserId}. ${err}`)
    }
  }

  return profile
}

export async function createProfile(slackId : string, groupId : number) : Promise<Profile>{
  // check if the user exists
  const slackProfile = (await getSlackProfileFromSlackId(slackId))
  const email = slackProfile.email
  const realName = slackProfile.real_name

  let user = await prisma.user.findUnique({
    where: {
      email: email
    },
  })

  // if the user doesn't exist in our db, create them
  //   and create a profile for them
  const profileData = {
    slackId: slackId,
    groups: {
      connect: {
        id: groupId
      }
    }
  }
  if (!user) {
    await prisma.user.create({
      data: {
        email: email,
        name: realName,
        imageUrl: slackProfile.image_512,
        profiles: {
          create: profileData
        }
      },
    })
  }else{
    // create the profile if they don't exist
    await prisma.profile.create({
      data: {
        ...profileData,
        userId: user.id
      },
    })
  }
  // see above for why findFirst is used
  //   we now have a profile, so we can return it
  let profile = await prisma.profile.findFirst({
    where: {
      slackId: slackId
    },
  })
  if(profile === undefined) {
    throw new Error(`db error, failed to find created profile with slackId: ${slackId}`)
  }
  return profile!
}

export async function getGroupIDFromSlackID(slackTeamId : string, createGroupIfNotExists : boolean = false) : Promise<number>{
  // query the database for the group
  //   see above for why findFirst is used
  let group = await prisma.group.findFirst({
    where: {
      slackTeamId: slackTeamId
    },
  })

  if (createGroupIfNotExists && !group) {
    // get workspace name for nice labelling of new group
    let slackWorkspaceName
    try {
      slackWorkspaceName = (await getSlackWorkspaceName())
      if(slackWorkspaceName === undefined) {
        throw new Error('slackWorkspace not found')
      }
    } catch (err) {
      console.log('Error getting workspace')
      throw Error('Error getting workspace')
    }

    // create the group if they don't exist
    await prisma.group.create({
      data: {
        slackTeamId: slackTeamId,
        type: GroupType.SLACK,
        name: slackWorkspaceName,
      },
    })
    // we now have a group, so we can return it
    group = await prisma.group.findFirst({
      where: {
        slackTeamId: slackTeamId
      },
    })
  } else if (!group) {
    throw Error('Group not found')
  }

  return group!.id
}

export function tokenizeString(instring : string) {
  const array : string[] = instring.split(' ').filter((element) => {
    return element !== ''
  })
  console.log('Tokenized version:', array)
  return array
}

export async function getSlackPermalinkFromChannelAndTS(channel: string, timestamp: string){
  const url = `https://slack.com/api/chat.getPermalink?channel=${channel}&message_ts=${timestamp}`
  const data = await callSlackApi({}, url, 'get') as {ok: boolean, permalink: string}
  if (data.ok === false) {
    console.error(`Error getting link for ${channel} and ${timestamp}:`, data)
    throw new Error('No message found')
  }
  return data.permalink
}

export async function postBlockMessage(channel : string, blocks : Blocks, notificationText : string = ''){
  await postMessage({
    channel,
    text: notificationText, // this is the fallback text, it shows up in e.g. system notifications
    blocks
  })
}

export async function postTextMessage(channel : string, payload : string){
  await postMessage({
    channel,
    text: payload,
  })
}

export async function postMessage(message: {channel: string, text: string, blocks?: Blocks}){
  console.log(`Posting message to channel: ${message.channel}, text: ${message.text}, blocks: `, message?.blocks)

  const url = 'https://slack.com/api/chat.postMessage'
  return await callSlackApi(message, url) as {ok: boolean, ts: string}
}

export async function updateMessage(message: {channel: string, ts: string, text: string, blocks?: Blocks}){
  console.log(`Updating message to channel: ${message.channel}, text: ${message.text}, blocks: `, message?.blocks)

  const url = 'https://slack.com/api/chat.update'
  return await callSlackApi(message, url) as {ok: boolean}
}

export async function showModal(triggerId: string, view: ModalView) {
  console.log('Showing modal view: ', view)

  const response = await callSlackApi({
    trigger_id: triggerId,
    view
  }, 'https://slack.com/api/views.open') as { ok: boolean, view: {id: string} }

  return response
}

async function callSlackApi(message: any, url: string, method = 'post') {
  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(message),
  })
  let data = await response.json() as {ok: boolean}
  if (data.ok === false) {
    console.error('Error calling Slack API:', data)
    throw new Error('Error calling Slack API')
  }
  return data
}

interface ResponseMessage {
  text: string
  response_type: "in_channel" | "ephemeral"
  replace_original: boolean
  blocks?: Blocks
  thread_ts?: string
  [key: string]: any
}

export async function postMessageToResponseUrl(message: ResponseMessage, responseUrl: string) {
  console.log(`\nPosting message to response url: ${responseUrl}: `, JSON.stringify(message, null, 2))
  const response = await fetch(responseUrl, {
    method: 'post',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(message),
  })

  if (response.ok === false) {
    console.error('Error posting message:', await response.text())
    throw new Error(`Error posting message to response URL`)
  }

  return await response.text()
}

export function getMostRecentForecastPerProfile(forecasts: Forecast[], date : Date) : [number, Forecast][] {
  const forecastsPerProfile = new Map<number, Forecast>()
  for (const forecast of forecasts) {
    const authorId = forecast.authorId
    if (forecastsPerProfile.has(authorId) && forecast.createdAt < date) {
      const existingForecast = forecastsPerProfile.get(authorId)
      if (existingForecast!.createdAt < forecast.createdAt) {
        forecastsPerProfile.set(authorId, forecast)
      }
    } else if(forecast.createdAt < date){
      forecastsPerProfile.set(authorId, forecast)
    }
  }
  return Array.from(forecastsPerProfile, ([id, value]) => [id, value])
}

export function getCommunityForecast(question : QuestionWithForecasts, date : Date) : number {
  // get all forecasts for this question
  const uptoDateForecasts : number[] = getMostRecentForecastPerProfile(question.forecasts, date).map(([, forecast]) => forecast.forecast.toNumber())
  // sum each forecast
  const summedForecasts : number = uptoDateForecasts.reduce(
    (acc, forecast) => acc + forecast,
    0
  )
  // divide by number of forecasts
  return summedForecasts / question.forecasts.length
}


export function conciseDateTime(date: Date, includeTime = true) {
  let timeStr = ''
  if (includeTime)
    timeStr = `${date.getHours()}:${date.getMinutes()} on `
  return `${timeStr}${date.getDate()}-${date.getMonth() + 1}-${date.getFullYear()}`
}

export function formatDecimalNicely(num : number) : string {
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecmialPlaces,})
}

export function getDateYYYYMMDD(date: Date) {
  return `${date.getFullYear()}-${zeroPad(date.getMonth() + 1)}-${zeroPad(date.getDate())}`
}

export function zeroPad(num: number) {
  return num.toString().padStart(2, '0')
}

export function round(number: number, places = 2) {
  // @ts-ignore
  return +(Math.round(number + "e+" + places)  + "e-" + places)
}
