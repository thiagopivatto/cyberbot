import { downloadMediaMessage, WASocket } from "baileys";
import { Bot } from "../../interfaces/bot.interface.js";
import { Message } from "../../interfaces/message.interface.js";
import { Group } from "../../interfaces/group.interface.js";
import { buildText, messageErrorCommandUsage, timestampToDate } from "../../lib/util.lib.js";
import getGeneralMessages from "../../lib/general-messages.lib.js";
import { UserController } from "../../controllers/user.controller.js";
import { GroupController } from "../../controllers/group.controller.js";
import { BotController } from "../../controllers/bot.controller.js";
import { adminMenu } from "../../lib/menu.lib.js";
import os from 'node:os'
import moment from "moment";
import * as Whatsapp from "../../lib/whatsapp.lib.js";
import { commandsAdmin } from "./commands-list.admin.js";

export async function adminCommand(client: WASocket, botInfo: Bot, message: Message, group: Group){
    await Whatsapp.replyText(client, message.chat_id, adminMenu(botInfo), message.wa_message, {expiration: message.expiration})
}

export async function apiCommand(client: WASocket, botInfo: Bot, message: Message, group: Group){
    const adminCommands = commandsAdmin(botInfo)
    const botController = new BotController()
    const supportedServices =  ['deepgram', 'acrcloud']
    const args = message.text_command.split(',')
    
    if (!message.text_command || !supportedServices.includes(args[0].toLowerCase().trim())) throw new Error(messageErrorCommandUsage(botInfo, message))
    
    const [serviceName] = args
    let replyText : string 

    if (serviceName.trim() == 'deepgram'){
        if (args.length != 2) throw new Error(adminCommands.api.msgs.reply_deepgram_error)
        const [secret_key] = args.slice(1)
        botController.setDeepgramApiKey(secret_key.trim())
        replyText = adminCommands.api.msgs.reply_deepgram_success
    } else {
        if (args.length != 4) throw new Error(adminCommands.api.msgs.reply_acrcloud_error)
        const [host, access_key, secret_key] = args.slice(1)
        botController.setAcrcloudApiKey(host.trim(), access_key.trim(), secret_key.trim())
        replyText = adminCommands.api.msgs.reply_acrcloud_success
    }
    
    await Whatsapp.replyText(client, message.chat_id, replyText, message.wa_message, {expiration: message.expiration})
}

export async function sairCommand(client: WASocket, botInfo: Bot, message: Message, group: Group){
    const groupController = new GroupController()
    const adminCommands = commandsAdmin(botInfo)
    
    if (!message.args.length) throw new Error(messageErrorCommandUsage(botInfo, message))

    let currentGroups = await groupController.getAllGroups()
    let chosenGroupNumber = Number(message.text_command)
    const indexGroup = chosenGroupNumber - 1

    if (!chosenGroupNumber || !currentGroups[indexGroup]) throw new Error(adminCommands.sair.msgs.error)

    const replyText = buildText(adminCommands.sair.msgs.reply, currentGroups[indexGroup].name, chosenGroupNumber)
    await Whatsapp.leaveGroup(client, currentGroups[indexGroup].id)

    if (message.isGroupMsg && currentGroups[indexGroup].id == message.chat_id) await Whatsapp.sendText(client, message.sender, replyText)
    else await Whatsapp.replyText(client, message.chat_id, replyText, message.wa_message, {expiration: message.expiration})
}

export async function vergruposCommand(client: WASocket, botInfo: Bot, message: Message, group: Group){
    const groupController = new GroupController()
    const adminCommands = commandsAdmin(botInfo)

    const currentGroups = await groupController.getAllGroups()
    let replyText = buildText(adminCommands.vergrupos.msgs.reply_title, currentGroups.length)

    for (let group of currentGroups){
        const groupNumber = currentGroups.indexOf(group) + 1
        const adminsGroup = group.admins
        const isBotGroupAdmin = adminsGroup.includes(botInfo.host_number)
        const linkGroupCommand = isBotGroupAdmin ? `${botInfo.prefix}linkgrupo ${groupNumber}` : '----'
        replyText += buildText(adminCommands.vergrupos.msgs.reply_item, groupNumber, group.name, group.participants.length, adminsGroup.length,  isBotGroupAdmin ? "Sim" : "Não",  linkGroupCommand, groupNumber)
    }

    await Whatsapp.replyText(client, message.chat_id, replyText, message.wa_message, {expiration: message.expiration})
}

export async function sairgruposCommand(client: WASocket, botInfo: Bot, message: Message, group: Group){
    const groupController = new GroupController()
    const adminCommands = commandsAdmin(botInfo)

    const currentGroups = await groupController.getAllGroups()
    const replyText = buildText(adminCommands.sairgrupos.msgs.reply, currentGroups.length)

    currentGroups.forEach(async (group) =>{
        await Whatsapp.leaveGroup(client, group.id)
    })

    if (message.isGroupMsg) await Whatsapp.sendText(client, message.sender, replyText)
    else await Whatsapp.replyText(client, message.chat_id, replyText, message.wa_message, {expiration: message.expiration}) 
}

export async function linkgrupoCommand(client: WASocket, botInfo: Bot, message: Message, group: Group){
    const groupController = new GroupController()
    const adminCommands = commandsAdmin(botInfo)
    
    if(!message.args.length) throw new Error(messageErrorCommandUsage(botInfo, message))

    let currentGroups = await groupController.getAllGroups()
    let chosenGroupNumber = Number(message.text_command)
    const indexGroup = chosenGroupNumber - 1

    if(!chosenGroupNumber || !currentGroups[indexGroup]) throw new Error(adminCommands.linkgrupo.msgs.error_not_found)
    if(!currentGroups[indexGroup].admins.includes(botInfo.host_number)) throw new Error(adminCommands.linkgrupo.msgs.error_bot_not_admin)

    const inviteLink = await Whatsapp.getGroupInviteLink(client, currentGroups[indexGroup].id)
    const replyTextAdmin = buildText(adminCommands.linkgrupo.msgs.reply_admin, currentGroups[indexGroup].name, chosenGroupNumber, inviteLink)

    if(message.isGroupMsg){
        const replyText = adminCommands.linkgrupo.msgs.reply_group
        await Whatsapp.replyText(client, message.chat_id, replyText, message.wa_message, {expiration: message.expiration})
        await Whatsapp.sendText(client, message.sender, replyTextAdmin)
    } else {
        await Whatsapp.replyText(client, message.chat_id, replyTextAdmin, message.wa_message, {expiration: message.expiration})
    }
}

export async function veradminsCommand(client: WASocket, botInfo: Bot, message: Message, group: Group){
    const userController = new UserController()
    const adminCommands = commandsAdmin(botInfo)
    const generalMessages = getGeneralMessages(botInfo)

    if(!message.isBotOwner) throw new Error(generalMessages.permission.owner_bot_only)

    const adminsBot = await userController.getAdmins()
    let replyText = buildText(adminCommands.veradmins.msgs.reply_title, adminsBot.length)

    adminsBot.forEach((admin) => {
        const adminNumberList  = adminsBot.indexOf(admin) + 1
        const userType = admin.owner ? generalMessages.user_types.owner : (admin.admin ? generalMessages.user_types.admin  : generalMessages.user_types.user)
        replyText += buildText(adminCommands.veradmins.msgs.reply_item, adminNumberList, admin.name, Whatsapp.removeWhatsappSuffix(admin.id), userType)
    })

    await Whatsapp.replyText(client, message.chat_id, replyText, message.wa_message, {expiration: message.expiration})
}

export async function addadminCommand(client: WASocket, botInfo: Bot, message: Message, group: Group){
    const userController = new UserController()
    const adminCommands = commandsAdmin(botInfo)
    const generalMessages = getGeneralMessages(botInfo)

    if(!message.isBotOwner) throw new Error(generalMessages.permission.owner_bot_only)

    const currentAdmins = await userController.getAdmins()
    const currentAdminsId = currentAdmins.map(user => user.id)
    let targetUserId : string

    if (message.isQuoted && message.quotedMessage) targetUserId = message.quotedMessage?.sender
    else if (message.mentioned.length) targetUserId = message.mentioned[0]
    else if (message.args.length) targetUserId = Whatsapp.addWhatsappSuffix(message.text_command)
    else throw new Error(messageErrorCommandUsage(botInfo, message))

    const userData = await userController.getUser(targetUserId)

    if(!userData) throw new Error(adminCommands.addadmin.msgs.error_user_not_found)
    if(currentAdminsId.includes(userData.id)) throw new Error(adminCommands.addadmin.msgs.error_already_admin)

    await userController.promoteUser(userData.id)
    const replyText = buildText(adminCommands.addadmin.msgs.reply, Whatsapp.removeWhatsappSuffix(userData.id), userData.name)
    await Whatsapp.replyText(client, message.chat_id, replyText, message.wa_message, {expiration: message.expiration})
}

export async function rmadminCommand(client: WASocket, botInfo: Bot, message: Message, group: Group){
    const userController = new UserController()
    const adminCommands = commandsAdmin(botInfo)
    const generalMessages = getGeneralMessages(botInfo)

    if(!message.isBotOwner) throw new Error(generalMessages.permission.owner_bot_only)

    const currentAdmins = await userController.getAdmins()
    const ownerData = await userController.getOwner()
    const currentAdminsId = currentAdmins.map(user => user.id)
    let targetUserId : string

    if (message.isQuoted && message.quotedMessage) targetUserId = message.quotedMessage?.sender
    else if (message.mentioned.length) targetUserId = message.mentioned[0]
    else if (message.args.length == 1 && message.args[0].length <= 3) targetUserId = currentAdmins[parseInt(message.text_command) - 1].id
    else if (message.args.length) targetUserId = Whatsapp.addWhatsappSuffix(message.text_command)
    else throw new Error(messageErrorCommandUsage(botInfo, message))

    const userData = await userController.getUser(targetUserId)

    if(!userData) throw new Error(adminCommands.rmadmin.msgs.error_user_not_found)
    if(!currentAdminsId.includes(userData.id)) throw new Error(adminCommands.rmadmin.msgs.error_not_admin)
    if(ownerData?.id == userData.id) throw new Error(adminCommands.rmadmin.msgs.error_demote_owner)

    await userController.demoteUser(userData.id)
    const replyText = buildText(adminCommands.addadmin.msgs.reply, Whatsapp.removeWhatsappSuffix(userData.id), userData.name)
    await Whatsapp.replyText(client, message.chat_id, replyText, message.wa_message, {expiration: message.expiration})
}

export async function comandospvCommand(client: WASocket, botInfo: Bot, message: Message, group: Group){
    const botController = new BotController()
    const adminCommands = commandsAdmin(botInfo)
    const replyText = botInfo.commands_pv ? adminCommands.comandospv.msgs.reply_off : adminCommands.comandospv.msgs.reply_on

    botController.setCommandsPv(!botInfo.commands_pv)
    await Whatsapp.replyText(client, message.chat_id, replyText, message.wa_message, {expiration: message.expiration})
}

export async function taxacomandosCommand(client: WASocket, botInfo: Bot, message: Message, group: Group){
    const botController = new BotController()
    const adminCommands = commandsAdmin(botInfo)
    let replyText : string

    if(!botInfo.command_rate.status){
        if(!message.args.length) throw new Error(messageErrorCommandUsage(botInfo, message))

        let max_commands_minute = Number(message.args[0])
        let block_time = Number(message.args[1])
    
        if(!block_time) block_time = 60
        if(!max_commands_minute || max_commands_minute < 3) throw new Error(adminCommands.taxacomandos.msgs.error_max_commands_invalid)
        if(!block_time || block_time < 10) throw new Error(adminCommands.taxacomandos.msgs.error_block_time_invalid)

        replyText = buildText(adminCommands.taxacomandos.msgs.reply_on, max_commands_minute, block_time)
        await botController.setCommandRate(true, max_commands_minute, block_time)
    } else {
        replyText = adminCommands.taxacomandos.msgs.reply_off
        await botController.setCommandRate(false)
    }

    await Whatsapp.replyText(client, message.chat_id, replyText, message.wa_message, {expiration: message.expiration})
}

export async function autostickerpvCommand(client: WASocket, botInfo: Bot, message: Message, group: Group){
    const botController = new BotController()
    const adminCommands = commandsAdmin(botInfo)
    
    const replyText = botInfo.autosticker ? adminCommands.autostickerpv.msgs.reply_off : adminCommands.autostickerpv.msgs.reply_on
    botController.setAutosticker(!botInfo.autosticker)
    await Whatsapp.replyText(client, message.chat_id, replyText, message.wa_message, {expiration: message.expiration})
}

export async function bcmdglobalCommand(client: WASocket, botInfo: Bot, message: Message, group: Group){
    const botController = new BotController()

    if (!message.args.length) throw new Error(messageErrorCommandUsage(botInfo, message))

    const replyText = botController.blockCommandsGlobally(message.args)
    await Whatsapp.replyText(client, message.chat_id, replyText, message.wa_message, {expiration: message.expiration})
}

export async function dcmdglobalCommand(client: WASocket, botInfo: Bot, message: Message, group: Group){
    const botController = new BotController()

    if (!message.args.length) throw new Error(messageErrorCommandUsage(botInfo, message))

    const replyText = botController.unblockCommandsGlobally(message.args)
    await Whatsapp.replyText(client, message.chat_id, replyText, message.wa_message, {expiration: message.expiration})
}

export async function entrargrupoCommand(client: WASocket, botInfo: Bot, message: Message, group: Group){
    const adminCommands = commandsAdmin(botInfo)

    if (!message.args.length) throw new Error(messageErrorCommandUsage(botInfo, message))

    const linkGroup = message.text_command
    const isValidLink = linkGroup.match(/(https:\/\/chat.whatsapp.com)/gi)

    if (!isValidLink) throw new Error(adminCommands.entrargrupo.msgs.error_link_invalid)

    const linkId = linkGroup.replace(/(https:\/\/chat.whatsapp.com\/)/gi, '')
    const groupResponse =  await Whatsapp.joinGroupInviteLink(client, linkId).catch(() => {
        throw new Error(adminCommands.entrargrupo.msgs.error_group)
    })

    if(!groupResponse) await Whatsapp.replyText(client, message.chat_id, adminCommands.entrargrupo.msgs.reply_pending, message.wa_message, {expiration: message.expiration})
    await Whatsapp.replyText(client, message.chat_id, adminCommands.entrargrupo.msgs.reply, message.wa_message, {expiration: message.expiration})
}

export async function bcgruposCommand(client: WASocket, botInfo: Bot, message: Message, group: Group){
    const groupController = new GroupController()
    const adminCommands = commandsAdmin(botInfo)

    if (!message.args.length) throw new Error(messageErrorCommandUsage(botInfo, message))

    const currentGroups = await groupController.getAllGroups()
    const waitReply = buildText(adminCommands.bcgrupos.msgs.wait, currentGroups.length, currentGroups.length)
    await Whatsapp.replyText(client, message.chat_id, waitReply, message.wa_message, {expiration: message.expiration})

    currentGroups.forEach(async (group) => {
        if(!group.restricted){
            await new Promise<void>((resolve)=>{
                setTimeout(async ()=>{
                    const announceMessage = buildText(adminCommands.bcgrupos.msgs.message, message.text_command)
                    await Whatsapp.sendText(client, group.id, announceMessage, {expiration: group.expiration}).catch()
                    resolve()
                }, 1000)
            })
        }
    })

    await Whatsapp.replyText(client, message.chat_id, adminCommands.bcgrupos.msgs.reply, message.wa_message, {expiration: message.expiration})
}

export async function fotobotCommand(client: WASocket, botInfo: Bot, message: Message, group: Group){
    const adminCommands = commandsAdmin(botInfo)

    if(message.type != 'imageMessage' && message.quotedMessage?.type != 'imageMessage') throw new Error(messageErrorCommandUsage(botInfo, message))

    const messageData = (message.isQuoted) ? message.quotedMessage?.wa_message : message.wa_message

    if(!messageData) throw new Error(adminCommands.fotobot.msgs.error_message)

    let imageBuffer = await downloadMediaMessage(messageData, "buffer", {})
    await Whatsapp.updateProfilePic(client, botInfo.host_number, imageBuffer)
    await Whatsapp.replyText(client, message.chat_id, adminCommands.fotobot.msgs.reply, message.wa_message, {expiration: message.expiration})
}

export async function nomebotCommand(client: WASocket, botInfo: Bot, message: Message, group: Group){
    const botController = new BotController()
    const adminCommands = commandsAdmin(botInfo)

    if (!message.args.length) throw new Error(messageErrorCommandUsage(botInfo, message))

    botController.setName(message.text_command)
    await Whatsapp.replyText(client, message.chat_id, adminCommands.nomebot.msgs.reply, message.wa_message, {expiration: message.expiration})
}

export async function nomepackCommand(client: WASocket, botInfo: Bot, message: Message, group: Group){
    const botController = new BotController()
    const adminCommands = commandsAdmin(botInfo)

    if (!message.args.length) throw new Error(messageErrorCommandUsage(botInfo, message))

    botController.setPackSticker(message.text_command)
    await Whatsapp.replyText(client, message.chat_id, adminCommands.nomepack.msgs.reply, message.wa_message, {expiration: message.expiration})
}

export async function nomeautorCommand(client: WASocket, botInfo: Bot, message: Message, group: Group){
    const botController = new BotController()
    const adminCommands = commandsAdmin(botInfo)

    if (!message.args.length) throw new Error(messageErrorCommandUsage(botInfo, message))

    botController.setAuthorSticker(message.text_command)
    await Whatsapp.replyText(client, message.chat_id, adminCommands.nomeautor.msgs.reply, message.wa_message, {expiration: message.expiration})
}

export async function prefixoCommand(client: WASocket, botInfo: Bot, message: Message, group: Group){
    const botController = new BotController()
    const adminCommands = commandsAdmin(botInfo)
    const supportedPrefixes = ["!", "#", ".", "*"]

    if (!message.args.length) throw new Error(messageErrorCommandUsage(botInfo, message))
    if (!supportedPrefixes.includes(message.text_command)) throw new Error(adminCommands.prefixo.msgs.error_not_supported)

    botController.setPrefix(message.text_command)
    await Whatsapp.replyText(client, message.chat_id, adminCommands.prefixo.msgs.reply, message.wa_message, {expiration: message.expiration})
}

export async function listablockCommand(client: WASocket, botInfo: Bot, message: Message, group: Group){
    const adminCommands = commandsAdmin(botInfo)
    const blockedUsers = await Whatsapp.getBlockedContacts(client)

    if (!blockedUsers.length) throw new Error(adminCommands.listablock.msgs.error)

    let replyText = buildText(adminCommands.listablock.msgs.reply_title, blockedUsers.length)

    for (let userId of blockedUsers) {
        const userPosition = blockedUsers.indexOf(userId) + 1
        replyText += buildText(adminCommands.listablock.msgs.reply_item, userPosition, Whatsapp.removeWhatsappSuffix(userId))
    }

    await Whatsapp.replyText(client, message.chat_id, replyText, message.wa_message, {expiration: message.expiration})
}

export async function bloquearCommand(client: WASocket, botInfo: Bot, message: Message, group: Group){
    const userController = new UserController()
    const adminsId = (await userController.getAdmins()).map(admin => admin.id)
    const blockedUsers = await Whatsapp.getBlockedContacts(client)
    const adminCommands = commandsAdmin(botInfo)
    let targetUserId : string

    if(message.isQuoted && message.quotedMessage) targetUserId = message.quotedMessage?.sender
    else if(message.mentioned.length) targetUserId = message.mentioned[0]
    else if (message.args.length) targetUserId =  Whatsapp.addWhatsappSuffix(message.text_command)
    else throw new Error(messageErrorCommandUsage(botInfo, message))

    if (adminsId.includes(targetUserId)){
        throw new Error(buildText(adminCommands.bloquear.msgs.error_block_admin_bot, Whatsapp.removeWhatsappSuffix(targetUserId)))
    } else if (blockedUsers.includes(targetUserId)) {
        throw new Error(buildText(adminCommands.bloquear.msgs.error_already_blocked, Whatsapp.removeWhatsappSuffix(targetUserId)))
    } else {
        const replyText = buildText(adminCommands.bloquear.msgs.reply, Whatsapp.removeWhatsappSuffix(targetUserId))
        await Whatsapp.blockContact(client, targetUserId).catch(() => {
            throw new Error(adminCommands.bloquear.msgs.error_block)
        })
        await Whatsapp.replyText(client, message.chat_id, replyText, message.wa_message, {expiration: message.expiration})
    }
}

export async function desbloquearCommand(client: WASocket, botInfo: Bot, message: Message, group: Group){
    const blockedUsers = await Whatsapp.getBlockedContacts(client)
    const adminCommands = commandsAdmin(botInfo)
    let targetUserId : string

    if(message.isQuoted && message.quotedMessage) targetUserId = message.quotedMessage?.sender
    else if(message.mentioned.length) targetUserId = message.mentioned[0]
    else if(message.args.length == 1 && message.args[0].length <= 3 && Number(message.args[0])) targetUserId = blockedUsers[Number(message.args[0]) - 1]
    else if (message.args.length) targetUserId =  Whatsapp.addWhatsappSuffix(message.text_command)
    else throw new Error(messageErrorCommandUsage(botInfo, message))

    if (!blockedUsers.includes(targetUserId)) {
        throw new Error(buildText(adminCommands.desbloquear.msgs.error_already_unblocked, Whatsapp.removeWhatsappSuffix(targetUserId)))
    } else {
        const replyText = buildText(adminCommands.desbloquear.msgs.reply, Whatsapp.removeWhatsappSuffix(targetUserId))
        await Whatsapp.unblockContact(client, targetUserId).catch(() => {
            throw new Error(adminCommands.desbloquear.msgs.error_unblock)
        })
        await Whatsapp.replyText(client, message.chat_id, replyText, message.wa_message, {expiration: message.expiration})
    }
}

export async function recadoCommand(client: WASocket, botInfo: Bot, message: Message, group: Group){
    const adminCommands = commandsAdmin(botInfo)
    
    if(!message.args.length) throw new Error(messageErrorCommandUsage(botInfo, message))

    await Whatsapp.updateProfileStatus(client, message.text_command)
    const replyText = buildText(adminCommands.recado.msgs.reply, message.text_command)
    await Whatsapp.replyText(client, message.chat_id, replyText, message.wa_message, {expiration: message.expiration})
}

export async function verusuarioCommand(client: WASocket, botInfo: Bot, message: Message, group: Group){
    const userController = new UserController()
    const adminCommands = commandsAdmin(botInfo)
    const generalMessages = getGeneralMessages(botInfo)
    let targetUserId : string

    if(message.isQuoted && message.quotedMessage) targetUserId = message.quotedMessage.sender
    else if(message.mentioned.length) targetUserId = message.mentioned[0]
    else if(message.args.length) targetUserId = Whatsapp.addWhatsappSuffix(message.text_command)
    else throw new Error(messageErrorCommandUsage(botInfo, message))

    let userData = await userController.getUser(targetUserId)

    if (!userData) throw new Error(adminCommands.verusuario.msgs.error_user_not_found)

    const userType = userData.owner ? generalMessages.user_types.owner : (userData.admin ? generalMessages.user_types.admin  : generalMessages.user_types.user)
    const replyText = buildText(adminCommands.verusuario.msgs.reply, userData.name || '---', userType, Whatsapp.removeWhatsappSuffix(userData.id), userData.commands)
    await Whatsapp.replyText(client, message.chat_id, replyText, message.wa_message, {expiration: message.expiration})
}

export async function desligarCommand(client: WASocket, botInfo: Bot, message: Message, group: Group){
    const adminCommands = commandsAdmin(botInfo)

    await Whatsapp.replyText(client, message.chat_id, adminCommands.desligar.msgs.reply, message.wa_message, {expiration: message.expiration}).then(async()=>{
        Whatsapp.shutdownBot(client)
    })
}

export async function pingCommand(client: WASocket, botInfo: Bot, message: Message, group: Group){
    const userController = new UserController()
    const groupController = new GroupController()
    const adminCommands = commandsAdmin(botInfo)
    const replyTime = ((moment.now()/1000) - message.t).toFixed(2)
    const ramTotal = (os.totalmem()/1024000000).toFixed(2)
    const ramUsed = ((os.totalmem() - os.freemem())/1024000000).toFixed(2)
    const systemName = `${os.type()} ${os.release()}`
    const cpuName = os.cpus()[0].model
    const currentGroups = await groupController.getAllGroups()
    const currentUsers = await userController.getUsers()
    const botStarted = timestampToDate(botInfo.started)
    const replyText = buildText(adminCommands.ping.msgs.reply, systemName, cpuName, ramUsed, ramTotal, replyTime, currentUsers.length, currentGroups.length, botStarted)
    await Whatsapp.replyText(client, message.chat_id, replyText, message.wa_message, {expiration: message.expiration})
}


