import moment from "moment-timezone"
import chalk from 'chalk'
import path from 'node:path'
import fs from 'fs-extra'
import { Bot } from "../interfaces/bot.interface.js"
import getGeneralMessages from "./general-messages.lib.js"
import { Message } from "../interfaces/message.interface.js"

export function messageErrorCommandUsage(botInfo: Bot, message: Message){
    const generalMessages = getGeneralMessages(botInfo)
    return buildText(generalMessages.error_command_usage, message.command, message.command)
}

export function messageErrorCommand(botInfo: Bot, command: string, reason: string){
    const generalMessages = getGeneralMessages()
    return buildText(generalMessages.error_command, command, reason)
}

export function getCurrentBotVersion(){
    return JSON.parse(fs.readFileSync(path.resolve('package.json'), {encoding: 'utf-8'})).version
}

export function colorText(text: string, color?: string){
    return !color ? chalk.green(text) : chalk.hex(color)(text)
}

export function buildText(text : string, ...params : any[]){
  for(let i = 0; i < params.length; i++){
      text = text.replace(`{p${i+1}}`, params[i])
  }
  return text
}

export function timestampToDate(timestamp : number){
    return moment(timestamp).format('DD/MM HH:mm:ss')
}

export function currentDate(){
  return moment(Date.now()).format('DD/MM HH:mm:ss')
}

export function getResponseTime(timestamp: number){
    let responseTime = ((moment.now()/1000) - timestamp).toFixed(2)
    return responseTime
}

export function showCommandConsole(isGroup : boolean, categoryName: string, command: string, hexColor: string, messageTimestamp: number, pushName: string, groupName?: string){
    let formattedMessageTimestamp = timestampToDate(messageTimestamp * 1000)
    let responseTimeSeconds = getResponseTime(messageTimestamp)
    if (!pushName) pushName = "DESCONHECIDO"
    if (!groupName) groupName = "DESCONHECIDO"

    if (isGroup){
      console.log('\x1b[1;31m~\x1b[1;37m>', colorText(`[${categoryName}]`, hexColor), formattedMessageTimestamp, colorText(command), 'de', colorText(pushName), 'em', colorText(groupName), `(${colorText(`${responseTimeSeconds}s`)})`)
    } else {
      console.log('\x1b[1;31m~\x1b[1;37m>', colorText(`[${categoryName}]`, hexColor), formattedMessageTimestamp, colorText(command), 'de', colorText(pushName), `(${colorText(`${responseTimeSeconds}s`)})`)
    }
}

export function uppercaseFirst(text: string){
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function removeBold(text: string){
    return text.replace(/\*/gm, "").trim()
}

export function getRandomFilename(extension : '.mp4' | '.mp3' | '.jpg' | '.png'){
    return `${Math.floor(Math.random() * 10000)}${extension}`
}

export function randomDelay(ms_min : number, ms_max : number){
   return new Promise <void> ((resolve, reject)=>{
      let randomDelayMs = Math.floor(Math.random() * (ms_max - ms_min + 1)) + ms_min
      setTimeout(async ()=>{
          resolve()
      }, randomDelayMs)
   })
}

export function showConsoleError(err: any, error_type : string){
  console.error(colorText(`[${error_type}]`,"#d63e3e"), err)
}
