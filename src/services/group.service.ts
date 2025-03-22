import Datastore from "@seald-io/nedb";
import { ParticipantCounter, Group, ParticipantAntiFlood } from "../interfaces/group.interface.js";
import { Bot } from "../interfaces/bot.interface.js";
import { CategoryCommand } from "../interfaces/command.interface.js";
import { Message, MessageTypes } from "../interfaces/message.interface.js";
import { GroupMetadata } from 'baileys'
import { timestampToDate, buildText } from '../lib/util.lib.js'
import moment from 'moment-timezone'
import getGeneralMessages from "../lib/general-messages.lib.js";
import { commandsGroup } from "../commands/group/commands-list.group.js";
import { commandExist, getCommandsByCategory } from "../commands/commands.util.js";
import { getGroupAdminsByMetadata, getGroupParticipantsByMetadata, removePrefix, removeWhatsappSuffix } from "../lib/whatsapp.lib.js";

const db = {
    groups : new Datastore<Group>({filename : './storage/groups.db', autoload: true}),
    group_antiflood : new Datastore<ParticipantAntiFlood>({filename : './storage/antiflood.groups.db', autoload: true}),
    group_counter : new Datastore<ParticipantCounter>({filename : './storage/counter.groups.db', autoload: true})
}

export class GroupService {
    constructor(){}
    
    // *********************** Registra/Atualiza/Remove grupos ***********************
    public async registerGroup(group : GroupMetadata){
        const isRegistered = await this.isRegistered(group.id)

        if (isRegistered) return

        const participants = getGroupParticipantsByMetadata(group)
        const admins = getGroupAdminsByMetadata(group)
        const groupData : Group = {
            id: group.id,
            name: group.subject,
            description: group.desc,
            commands_executed: 0,
            participants,
            admins,
            owner: group.owner,
            restricted: group.announce,
            expiration: group.ephemeralDuration,
            muted : false,
            welcome : { status: false, msg: '' },
            antifake : { status: false, allowed: [] },
            antilink : false,
            antiflood : { status: false, max_messages: 10, interval: 10},
            autosticker : false,
            counter : { status: false, started: '' },
            block_cmds : [],
            blacklist : []
        }

        return db.groups.insertAsync(groupData)
    }

    public async registerGroups(groups: GroupMetadata[]) {
        for (let group of groups) await this.registerGroup(group)
    }

    public updateGroup(group : GroupMetadata){
        const participants = getGroupParticipantsByMetadata(group)
        const admins = getGroupAdminsByMetadata(group)
        return db.groups.updateAsync({ id : group.id }, { $set: {
            name: group.subject,
            description: group.desc,
            participants,
            admins,
            owner: group.owner,
            restricted: group.announce,
            expiration: group.ephemeralDuration
        }})
    }

    public async updateGroups(groups: GroupMetadata[]){
        for (let group of groups) await this.updateGroup(group)
    }

    public updatePartialGroup(group: Partial<GroupMetadata>) {
        if (group.id){
            if (group.desc) return this.setDescription(group.id, group.desc)
            if (group.subject) return this.setName(group.id, group.subject)
            if (group.announce) return this.setRestricted(group.id, group.announce)
            if (group.ephemeralDuration) return this.setExpiration(group.id, group.ephemeralDuration)
        }
    }

    public async getGroup(groupId : string){
        const group = await db.groups.findOneAsync({id: groupId}) as Group | null
        return group
    }

    public async removeGroup(groupId: string){
        return db.groups.removeAsync({id: groupId}, {multi: true})
    }

    public async getAllGroups(){
        const groups = await db.groups.findAsync({}) as Group[]
        return groups
    }

    public async isRegistered(groupId: string) {
        const group = await this.getGroup(groupId)
        return (group != null)
    }

    public async isRestricted(groupId: string) {
        const group = await this.getGroup(groupId)
        return group?.restricted
    }

    public setName(groupId: string, name: string){
        return db.groups.updateAsync({id: groupId}, { $set : { name } })
    }

    public setRestricted(groupId: string, restricted: boolean){
        return db.groups.updateAsync({id: groupId}, { $set: { restricted } })
    }

    private setExpiration(groupId: string, expiration: number | undefined){
        return db.groups.updateAsync({id: groupId}, { $set: { expiration } })
    }

    public setDescription(groupId: string, description?: string){
        return db.groups.updateAsync({id: groupId}, { $set: { description } })
    }

    public incrementGroupCommands(groupId: string){
        return db.groups.updateAsync({id : groupId}, {$inc: {commands_executed: 1}})
    } 

    // *********************** Adiciona/Atualiza/Remove participantes e admins. ***********************
    public async getParticipants(groupId: string){
        const group = await this.getGroup(groupId)
        return group?.participants || []
    }

    public async isParticipant(groupId: string, userId: string){
        const participants = await this.getParticipants(groupId)
        return participants.includes(userId)
    }

    public async getAdmins(groupId: string){
        const group = await this.getGroup(groupId)
        return group?.admins || []
    }

    public async isAdmin(groupId: string, userId: string){
        const admins = await this.getAdmins(groupId)
        return admins.includes(userId)
    }

    public async getOwner(groupId: string){
        const group = await this.getGroup(groupId)
        return group?.owner
    }

    public async addParticipant(groupId: string, userId: string){
        const isParticipant = await this.isParticipant(groupId, userId)
        if (!isParticipant) return db.groups.updateAsync({id : groupId}, { $push: { participants: userId } })
    }

    public async removeParticipant(groupId: string, userId: string){
        const isParticipant = await this.isParticipant(groupId, userId)
        if (isParticipant) {
            await db.groups.updateAsync({id : groupId}, { $pull: { participants : userId } })
            return this.removeAdmin(groupId, userId)
        }  
    }

    public async addAdmin(groupId: string, userId: string){
        const isAdmin = await this.isAdmin(groupId, userId)
        if (!isAdmin) return db.groups.updateAsync({id : groupId}, { $push: { admins: userId} })
    }

    public async removeAdmin(groupId: string, userId: string){
        const isAdmin = await this.isAdmin(groupId, userId)
        if (isAdmin) return db.groups.updateAsync({id : groupId}, { $pull: { admins : userId } })
    }

    // *********************** RECURSOS DO GRUPO ***********************

    // ***** BEM-VINDO *****
    public setWelcome(groupId: string, status: boolean, msg: string){
        return db.groups.updateAsync({id : groupId}, { $set: { "welcome.status": status, "welcome.msg":msg }})
    }

    public getWelcomeMessage(group: Group, botInfo: Bot, userId: string){
        const generalMessages = getGeneralMessages(botInfo)
        const custom_message = (group.welcome.msg != "") ? group.welcome.msg + "\n\n" : ""
        const message_welcome = buildText(generalMessages.group_welcome_message, removeWhatsappSuffix(userId), group.name, custom_message)
        return message_welcome
    }

    // ***** ANTI-FAKE *****
    public setAntifake(groupId: string, status: boolean, allowed: string[]){
        return db.groups.updateAsync({id: groupId}, {$set: { "antifake.status": status, "antifake.allowed": allowed }})
    }

    public isNumberFake(group: Group, userId: string){
        const allowedPrefixes = group.antifake.allowed
        for(let numberPrefix of allowedPrefixes){
            if (userId.startsWith(numberPrefix)) return false
        }
        return true
    }

    // ***** MUTAR GRUPO *****
    public setMuted(groupId: string, status: boolean){
        return db.groups.updateAsync({id: groupId}, {$set: { muted : status}})
    }

    // ***** ANTI-LINK *****
    public setAntilink(groupId: string, status: boolean){
        return db.groups.updateAsync({id : groupId}, { $set: { antilink: status } })
    }

    public async isMessageWithLink(message: Message, group: Group, botInfo : Bot){
        const { body, caption, isGroupAdmin} = message
        const userText = body || caption
        const { id, admins } = group
        const isBotAdmin = admins.includes(botInfo.host_number)

        if (!group?.antilink) return false

        if (!isBotAdmin) {
            await this.setAntilink(id, false)
        } else {
            if (userText) {
                const isUrl = userText.match(new RegExp(/(http:\/\/www\.|https:\/\/www\.|http:\/\/|https:\/\/)?[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,5}(:[0-9]{1,5})?(\/.*)?/img))
                if (isUrl && !isGroupAdmin) return true
            }
        }

        return false
    }

    // ***** AUTO-STICKER *****
    public setAutosticker(groupId: string, status: boolean){
        return db.groups.updateAsync({id: groupId}, { $set: { autosticker: status } })
    }

    // ***** ANTI-FLOOD *****
    public async setAntiFlood(groupId: string, status: boolean, maxMessages: number, interval: number){
        if (!status) await this.removeGroupAntiFlood(groupId)
        return db.groups.updateAsync({id : groupId}, { $set:{ 'antiflood.status' : status, 'antiflood.max_messages' : maxMessages, 'antiflood.interval' : interval } })
    }

    public async isFlood(group: Group, userId: string, isGroupAdmin: boolean){
        const currentTimestamp = Math.round(moment.now()/1000)
        const participantAntiFlood = await this.getParticipantAntiFlood(group.id, userId)
        let isFlood = false

        if(isGroupAdmin) return false

        if (participantAntiFlood){
            const hasExpiredMessages = await this.hasExpiredMessages(group, participantAntiFlood, currentTimestamp)

            if (!hasExpiredMessages && participantAntiFlood.msgs >= group.antiflood.max_messages) {
                isFlood = true
            } else {
                isFlood = false
            }
        } else {
            await this.registerParticipantAntiFlood(group, userId)
        }
    
        return isFlood
    }

    private removeGroupAntiFlood(groupId: string){
        return db.group_antiflood.removeAsync({group_id: groupId}, {multi: true})
    }

    private async registerParticipantAntiFlood(group: Group, userId: string){
        const isRegistered = (await this.getParticipantAntiFlood(group.id, userId)) ? true : false

        if (isRegistered) return 

        const timestamp = Math.round(moment.now()/1000)

        const participantAntiFlood : ParticipantAntiFlood = {
            user_id: userId,
            group_id: group.id,
            expire: timestamp + group.antiflood.interval,
            msgs: 1
        }

        return db.group_antiflood.insertAsync(participantAntiFlood)
    }

    private async getParticipantAntiFlood(groupId: string, userId: string){
        const participantAntiFlood = await db.group_antiflood.findOneAsync({group_id: groupId, user_id: userId}) as ParticipantAntiFlood | null
        return participantAntiFlood
    }

    private async hasExpiredMessages(group: Group, participantAntiFlood: ParticipantAntiFlood, currentTimestamp: number){
        if (group && currentTimestamp > participantAntiFlood.expire){
            const expireTimestamp = currentTimestamp + group?.antiflood.interval
            await db.group_antiflood.updateAsync({group_id: participantAntiFlood.group_id, user_id: participantAntiFlood.user_id}, { $set : { expire: expireTimestamp, msgs: 1 } })
            return true
        } else {
            await db.group_antiflood.updateAsync({group_id: participantAntiFlood.group_id, user_id: participantAntiFlood.user_id}, { $inc : { msgs: 1 } })
            return false
        }
    }

    // ***** LISTA-NEGRA *****
    public async getBlackList(groupId: string){
        const group = await this.getGroup(groupId)
        return group?.blacklist || []
    }

    public addBlackList(groupId: string, userId: string){
        return db.groups.updateAsync({id: groupId}, { $push: { blacklist: userId } })
    }

    public removeBlackList(groupId: string, userId: string){
        return db.groups.updateAsync({id: groupId}, { $pull: { blacklist: userId } } )
    }

    public async isBlackListed(groupId: string, userId: string){
        const list = await this.getBlackList(groupId)
        return list.includes(userId)
    }

    // ***** BLOQUEAR/DESBLOQUEAR COMANDOS *****
    public async blockCommands(group: Group, commands : string[], botInfo: Bot){
        const { prefix } = botInfo
        const groupCommands = commandsGroup(botInfo)
        let blockedCommands : string[] = []
        let blockResponse = groupCommands.bcmd.msgs.reply_title
        let categories : CategoryCommand[]  = ['sticker', 'utility', 'download', 'misc']

        if (commands[0] == 'variado') commands[0] = 'misc'
        if (commands[0] == 'utilidade') commands[0] = 'utility'

        if (categories.includes(commands[0] as CategoryCommand)) commands = getCommandsByCategory(botInfo, commands[0] as CategoryCommand)

        for (let command of commands) {
            if (commandExist(botInfo, command, 'utility') || commandExist(botInfo, command, 'misc') || commandExist(botInfo, command, 'sticker') || commandExist(botInfo, command, 'download')) {
                if (group.block_cmds.includes(removePrefix(prefix, command))) {
                    blockResponse += buildText(groupCommands.bcmd.msgs.reply_item_already_blocked, command)
                } else {
                    blockedCommands.push(removePrefix(prefix, command))
                    blockResponse += buildText(groupCommands.bcmd.msgs.reply_item_blocked, command)
                }
            } else if (commandExist(botInfo, command, 'group') || commandExist(botInfo, command, 'admin') || commandExist(botInfo, command, 'info')) {
                blockResponse += buildText(groupCommands.bcmd.msgs.reply_item_error, command)
            } else {
                blockResponse += buildText(groupCommands.bcmd.msgs.reply_item_not_exist, command)
            }
        }

        if (blockedCommands.length != 0) await db.groups.updateAsync({id : group.id}, { $push: { block_cmds: { $each: blockedCommands } } })

        return blockResponse
    }

    public async unblockCommand(group: Group, commands: string[], botInfo: Bot){
        const groupCommands = commandsGroup(botInfo)
        const { prefix } = botInfo
        let unblockedCommands : string[] = []
        let unblockResponse = groupCommands.dcmd.msgs.reply_title
        let categories : CategoryCommand[] | string[] = ['all', 'sticker', 'utility', 'download', 'misc']

        if (commands[0] == 'todos') commands[0] = 'all'
        if (commands[0] == 'utilidade') commands[0] = 'utility'
        if (commands[0] == 'variado') commands[0] = 'misc'

        if (categories.includes(commands[0])) {
            if (commands[0] === 'all') commands = group.block_cmds.map(command => prefix + command)
            else commands = getCommandsByCategory(botInfo, commands[0] as CategoryCommand)
        }

        for (let command of commands) {
            if (group.block_cmds.includes(removePrefix(prefix, command))) {
                unblockedCommands.push(removePrefix(prefix, command))
                unblockResponse += buildText(groupCommands.dcmd.msgs.reply_item_unblocked, command)
            } else {
                unblockResponse += buildText(groupCommands.dcmd.msgs.reply_item_not_blocked, command)
            }
        }

        if (unblockedCommands.length != 0) await db.groups.updateAsync({id : group.id}, { $pull: { block_cmds: { $in: unblockedCommands }} })

        return unblockResponse
    }

    public isBlockedCommand(group: Group, command: string, botInfo: Bot) {
        const {prefix} = botInfo
        return group.block_cmds.includes(removePrefix(prefix, command))
    }

    // ***** Activity/Counter *****
    public setCounter(groupId: string, status: boolean){
        const dateNow = (status) ? timestampToDate(moment.now()) : ''
        return db.groups.updateAsync({id: groupId}, { $set:{ "counter.status" : status, "counter.started" : dateNow } })
    }

    public removerGroupCounter(groupId: string){
        return db.group_counter.removeAsync({group_id: groupId}, {multi: true})
    }

    public async getParticipantActivity(groupId: string, userId: string){
        const participantCounter = await db.group_counter.findOneAsync({group_id: groupId, user_id: userId}) as ParticipantCounter | null
        return participantCounter
    }

    private async isParticipantActivityRegistered(groupId: string, userId: string){
        const userCounter = await this.getParticipantActivity(groupId, userId)
        return (userCounter != null)
    }

    public async registerParticipantActivity(groupId: string, userId: string){
        const isRegistered = await this.isParticipantActivityRegistered(groupId, userId)

        if (isRegistered) return

        const participantCounter : ParticipantCounter = {
            group_id : groupId,
            user_id: userId,
            msgs: 0,
            image: 0,
            audio: 0,
            sticker: 0,
            video: 0,
            text: 0,
            other: 0
        }

        return db.group_counter.insertAsync(participantCounter)
    }

    public async registerAllParticipantsActivity(groupId: string, participants: string[]){
        participants.forEach(async (participant) =>{
            await this.registerParticipantActivity(groupId, participant)
        })
    }

    public async getAllParticipantsActivity(groupId: string){
        const counters = await db.group_counter.findAsync({group_id : groupId}) as ParticipantCounter[]
        return counters
    }

    public incrementParticipantActivity(groupId: string, userId: string, type: MessageTypes){
        let incrementedUser : {msgs: number, text?: number, image?: number, video?: number, sticker?: number,  audio?: number, other?: number} = { msgs: 1 }

        switch (type) {
            case "conversation":
            case "extendedTextMessage":
                incrementedUser.text = 1
                break
            case "imageMessage":
                incrementedUser.image = 1
                break
            case "videoMessage":
                incrementedUser.video = 1
                break
            case "stickerMessage":
                incrementedUser.sticker = 1
                break
            case "audioMessage":
                incrementedUser.audio = 1
                break
            case "documentMessage":
                incrementedUser.other = 1
                break
        }

        return db.group_counter.updateAsync({group_id : groupId, user_id: userId}, {$inc: incrementedUser})
    }  

    public async getParticipantActivityLowerThan(group: Group, num : number){
        let inactives = await db.group_counter.findAsync({group_id : group.id, msgs: {$lt: num}}).sort({msgs: -1}) as ParticipantCounter[]
        inactives.forEach((inactive) => {
            if (!group.participants.includes(inactive.user_id)) inactives.splice(inactives.indexOf(inactive), 1)
        })
        return inactives
    }

    public async getParticipantsActivityRanking(group: Group, qty: number){
        let participantsLeaderboard = await db.group_counter.findAsync({group_id : group.id}).sort({msgs: -1}) as ParticipantCounter[]
        const qty_leaderboard = (qty > participantsLeaderboard.length) ? participantsLeaderboard.length : qty
        for (let i = 0; i < qty_leaderboard; i++) {
            if (!group.participants.includes(participantsLeaderboard[i].user_id)) participantsLeaderboard.splice(i, 1)
        }
        return participantsLeaderboard
    }
}