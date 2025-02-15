import {
  Client,
  GatewayIntentBits,
  TextChannel,
  CategoryChannel,
  ApplicationCommandType,
  ApplicationCommandOptionType,
  REST,
  Routes,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  EmbedBuilder,
  ChannelType,
  type ChatInputCommandInteraction,
  type ButtonInteraction,
  AttachmentBuilder
} from "discord.js";
import type { Server } from "http";
import { storage } from "./storage";

let client: Client | null = null;

const commands = [
  {
    name: 'ticket',
    type: ApplicationCommandType.ChatInput,
    description: 'Create a new support ticket',
    options: [
      {
        name: 'title',
        type: ApplicationCommandOptionType.String,
        description: 'The title of your ticket',
        required: true,
      }
    ],
  },
  {
    name: 'upgrade',
    type: ApplicationCommandType.ChatInput,
    description: 'Upgrade a ticket to a higher support role',
    options: [
      {
        name: 'role',
        type: ApplicationCommandOptionType.Role,
        description: 'The role to upgrade the ticket to',
        required: true,
      }
    ],
  },
  {
    name: 'add',
    type: ApplicationCommandType.ChatInput,
    description: 'Add a user to the current ticket',
    options: [
      {
        name: 'user',
        type: ApplicationCommandOptionType.User,
        description: 'The user to add to the ticket',
        required: true,
      }
    ],
  },
  {
    name: 'remove',
    type: ApplicationCommandType.ChatInput,
    description: 'Remove a user from the current ticket',
    options: [
      {
        name: 'user',
        type: ApplicationCommandOptionType.User,
        description: 'The user to remove from the ticket',
        required: true,
      }
    ],
  },
];

export async function setupDiscordBot(server: Server) {
  try {
    console.log('Starting Discord bot initialization...');

    client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });

    client.once("ready", async () => {
      console.log(`Discord bot successfully logged in as ${client?.user?.tag}`);

      // Register slash commands
      try {
        if (!client?.user) throw new Error("Client user is not defined");

        console.log('Registering slash commands...');
        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN!);
        await rest.put(
          Routes.applicationCommands(client.user.id),
          { body: commands }
        );
        console.log('Successfully registered slash commands');
      } catch (error) {
        console.error('Error registering slash commands:', error);
      }
    });

    client.on("interactionCreate", async (interaction) => {
      if (interaction.isButton()) {
        await handleButtonInteraction(interaction);
      } else if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'ticket') {
          await handleTicketCommand(interaction);
        } else if (interaction.commandName === 'upgrade') {
          await handleUpgradeCommand(interaction);
        } else if (interaction.commandName === 'add') {
          await handleAddUserCommand(interaction);
        } else if (interaction.commandName === 'remove') {
          await handleRemoveUserCommand(interaction);
        }
      }
    });

    // Login in a non-blocking way
    client.login(process.env.DISCORD_BOT_TOKEN).catch((error) => {
      console.error('Failed to login to Discord:', error);
      client = null;
    });

    return;
  } catch (error) {
    console.error('Error in Discord bot setup:', error);
    client = null;
  }
}

async function handleButtonInteraction(interaction: ButtonInteraction) {
  if (!interaction.customId.startsWith('ticket_')) return;

  const [, action, idStr] = interaction.customId.split('_');
  const id = parseInt(idStr);

  if (isNaN(id)) {
    await interaction.reply({
      content: 'Invalid configuration.',
      ephemeral: true
    });
    return;
  }

  try {
    switch (action) {
      case 'create':
        const panel = await storage.getPanel(id);
        if (!panel) {
          await interaction.reply({
            content: 'This ticket panel no longer exists.',
            ephemeral: true
          });
          return;
        }
        await createTicketChannel(interaction, panel);
        break;
      case 'close':
        await closeTicket(interaction, id);
        break;
      case 'claim':
        await claimTicket(interaction, id);
        break;
      case 'transcript':
        await saveTranscript(interaction, id);
        break;
      case 'delete':
        await deleteTicketChannel(interaction, id);
        break;
    }
  } catch (error) {
    console.error('Error handling button interaction:', error);
    await interaction.reply({
      content: 'There was an error processing your request.',
      ephemeral: true
    });
  }
}

async function createTicketChannel(interaction: ButtonInteraction, panel: any) {
  try {
    const ticketNumber = await getNextTicketNumber(panel.prefix);
    const ticketName = `${panel.prefix}-${ticketNumber}`;

    // Create channel with proper permissions
    const channel = await interaction.guild?.channels.create({
      name: ticketName.toLowerCase(),
      type: ChannelType.GuildText,
      parent: panel.categoryId,
      permissionOverwrites: [
        {
          id: interaction.guild!.id,
          deny: ['ViewChannel'],
        },
        {
          id: interaction.user.id,
          allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'],
        },
        ...panel.supportRoleIds.map((roleId: string) => ({
          id: roleId,
          allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'ManageMessages'],
        })),
      ],
    });

    if (!channel) {
      throw new Error('Failed to create ticket channel');
    }

    // Create ticket in database
    const ticket = await storage.createTicket({
      serverId: panel.serverId,
      panelId: panel.id,
      channelId: channel.id,
      userId: interaction.user.id,
      number: ticketNumber,
      status: 'open',
      claimedBy: null,
      messages: [], // Initialize empty messages array
    });

    // Create welcome embed
    const welcomeEmbed = new EmbedBuilder()
      .setTitle(`Welcome to Ticket: ${ticketName}`)
      .setDescription(`Hello ${interaction.user}, welcome to your ticket.\nOur support team will be with you shortly.`)
      .addFields(
        { name: 'Created by', value: `<@${interaction.user.id}>`, inline: true },
        { name: 'Support Team', value: panel.supportRoleIds.map((id: string) => `<@&${id}>`).join(', '), inline: true }
      )
      .setColor(0x00ff00)
      .setTimestamp();

    // Create initial message object for the ticket
    const initialMessage = {
      id: 1,
      content: welcomeEmbed.data.description || '',
      userId: client?.user?.id,
      username: client?.user?.username || 'Support Bot',
      avatarUrl: client?.user?.displayAvatarURL(),
      source: 'discord',
      createdAt: new Date().toISOString(),
      embedData: welcomeEmbed.toJSON(),
    };

    // Update ticket with initial message
    await storage.updateTicket(ticket.id, {
      messages: [JSON.stringify(initialMessage)],
    });

    // Set up message collector for the channel
    const collector = channel.createMessageCollector();
    collector.on('collect', async (message) => {
      if (message.author.bot) return; // Skip bot messages

      try {
        const existingTicket = await storage.getTicket(ticket.id);
        if (!existingTicket) return;

        const existingMessages = existingTicket.messages || [];
        const newMessage = {
          id: existingMessages.length + 1,
          content: message.content,
          userId: message.author.id,
          username: message.member?.displayName || message.author.username,
          avatarUrl: message.author.displayAvatarURL(),
          source: 'discord',
          createdAt: message.createdAt.toISOString(),
          attachments: message.attachments.map(att => ({
            url: att.url,
            name: att.name,
            contentType: att.contentType,
          })),
        };

        // Parse existing messages
        const parsedMessages = existingMessages.map(msg =>
          typeof msg === 'string' ? JSON.parse(msg) : msg
        );

        // Update ticket with new message
        await storage.updateTicket(ticket.id, {
          messages: [...parsedMessages, newMessage].map(msg => JSON.stringify(msg)),
        });

        console.log('Discord message stored:', {
          ticketId: ticket.id,
          messageContent: message.content,
          authorId: message.author.id,
          authorName: message.member?.displayName || message.author.username,
          messageCount: parsedMessages.length + 1
        });
      } catch (error) {
        console.error('Error storing Discord message:', error);
      }
    });

    // Create ticket management buttons
    const buttons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`ticket_claim_${ticket.id}`)
          .setLabel('Claim Ticket')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`ticket_close_${ticket.id}`)
          .setLabel('Close Ticket')
          .setStyle(ButtonStyle.Danger)
      );

    // Mention all relevant roles and the user
    const mentions = [
      `<@${interaction.user.id}>`,
      ...panel.supportRoleIds.map((id: string) => `<@&${id}>`)
    ].join(' ');

    // Send the initial message
    await channel.send({
      content: mentions,
      embeds: [welcomeEmbed],
      components: [buttons],
    });

    // Confirm ticket creation to user
    await interaction.reply({
      content: `Your ticket has been created in ${channel}`,
      ephemeral: true
    });
  } catch (error) {
    console.error('Error creating ticket channel:', error);
    await interaction.reply({
      content: 'Failed to create ticket channel. Please try again.',
      ephemeral: true
    });
  }
}

export async function createTicketPanel(
  guildId: string,
  channelId: string,
  panel: {
    id: number;
    title: string;
    description: string;
    prefix: string;
    categoryId: string;
    supportRoleIds: string[];
    serverId: number;
  }
) {
  if (!client) throw new Error('Discord bot is not initialized');

  try {
    console.log('Fetching channel:', channelId);
    const channel = await client.channels.fetch(channelId);
    if (!channel || !(channel instanceof TextChannel)) {
      throw new Error(`Invalid channel: ${channelId}`);
    }

    const rolesMention = panel.supportRoleIds
      .map(id => `<@&${id}>`)
      .join(', ');

    const embed = new EmbedBuilder()
      .setTitle(panel.title)
      .setDescription(panel.description)
      .addFields(
        {
          name: 'Support Team',
          value: rolesMention || 'No support roles assigned'
        },
        {
          name: 'Ticket Format',
          value: `${panel.prefix}-NUMBER`
        }
      )
      .setColor(0x0099ff);

    const button = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`ticket_create_${panel.id}`)
          .setLabel('Create Ticket')
          .setStyle(ButtonStyle.Primary)
      );

    console.log('Sending panel to channel:', {
      channelId,
      embed: embed.toJSON(),
      button: button.toJSON()
    });

    await channel.send({
      embeds: [embed],
      components: [button],
    });

    console.log('Successfully created ticket panel');
  } catch (error) {
    console.error('Error creating ticket panel:', error);
    throw error;
  }
}

export async function getServerChannels(guildId: string) {
  if (!client) throw new Error('Discord bot is not initialized');

  const guild = await client.guilds.fetch(guildId);
  const channels = await guild.channels.fetch();

  return channels
    .filter(channel => channel?.type === ChannelType.GuildText)
    .map(channel => ({
      id: channel!.id,
      name: channel!.name,
      type: channel!.type,
    }));
}

export async function getServerCategories(guildId: string) {
  if (!client) throw new Error('Discord bot is not initialized');

  const guild = await client.guilds.fetch(guildId);
  const channels = await guild.channels.fetch();

  return channels
    .filter(channel => channel?.type === ChannelType.GuildCategory)
    .map(channel => ({
      id: channel!.id,
      name: channel!.name,
      type: channel!.type,
    }));
}

export async function getServerRoles(guildId: string) {
  if (!client) throw new Error('Discord bot is not initialized');

  const guild = await client.guilds.fetch(guildId);
  const roles = await guild.roles.fetch();

  return roles.map(role => ({
    id: role.id,
    name: role.name,
  }));
}

async function getNextTicketNumber(prefix: string): Promise<number> {
  const tickets = await storage.getTicketsByPrefix(prefix);
  const numbers = tickets.map(t => t.number);
  const maxNumber = Math.max(0, ...numbers);
  return maxNumber + 1;
}

async function closeTicket(interaction: ButtonInteraction, ticketId: number) {
  try {
    const ticket = await storage.getTicket(ticketId);
    if (!ticket) {
      await interaction.reply({
        content: 'This ticket no longer exists.',
        ephemeral: true
      });
      return;
    }

    await storage.updateTicket(ticket.id, {
      status: 'closed',
      closedBy: interaction.user.id,
      closedAt: new Date(),
    });

    const channel = interaction.channel as TextChannel;

    // Create support team control panel
    const controlPanel = new EmbedBuilder()
      .setTitle('Ticket Controls')
      .setDescription('This ticket has been closed. Use the buttons below to manage the ticket.')
      .setColor(0xFF0000)
      .addFields(
        { name: 'Closed By', value: `<@${interaction.user.id}>`, inline: true },
        { name: 'Closed At', value: new Date().toLocaleString(), inline: true }
      );

    const buttons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`ticket_transcript_${ticket.id}`)
          .setLabel('Save Transcript')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`ticket_delete_${ticket.id}`)
          .setLabel('Delete Channel')
          .setStyle(ButtonStyle.Danger)
      );

    await channel.send({
      embeds: [controlPanel],
      components: [buttons],
    });

    // Remove user's access to the channel
    await channel.permissionOverwrites.edit(ticket.userId, {
      ViewChannel: false,
    });

    await interaction.reply({
      content: 'Ticket has been closed.',
      ephemeral: true
    });
  } catch (error) {
    console.error('Error closing ticket:', error);
    await interaction.reply({
      content: 'Failed to close ticket. Please try again.',
      ephemeral: true
    });
  }
}

async function claimTicket(interaction: ButtonInteraction, ticketId: number) {
  try {
    const ticket = await storage.getTicket(ticketId);
    if (!ticket) {
      await interaction.reply({
        content: 'This ticket no longer exists.',
        ephemeral: true
      });
      return;
    }

    // If ticket is already claimed by this user, unclaim it
    if (ticket.claimedBy === interaction.user.id) {
      await storage.updateTicket(ticket.id, {
        claimedBy: null,
      });

      const embed = new EmbedBuilder()
        .setTitle('Ticket Unclaimed')
        .setDescription(`Ticket has been unclaimed by <@${interaction.user.id}>`)
        .setColor(0xFF0000)
        .setTimestamp();

      await interaction.reply({
        embeds: [embed]
      });
      return;
    }

    // If ticket is claimed by someone else, don't allow claiming
    if (ticket.claimedBy) {
      await interaction.reply({
        content: `This ticket is already claimed by <@${ticket.claimedBy}>`,
        ephemeral: true
      });
      return;
    }

    await storage.updateTicket(ticket.id, {
      claimedBy: interaction.user.id,
    });

    const embed = new EmbedBuilder()
      .setTitle('Ticket Claimed')
      .setDescription(`Ticket has been claimed by <@${interaction.user.id}>`)
      .setColor(0x00ff00)
      .setTimestamp();

    await interaction.reply({
      embeds: [embed]
    });
  } catch (error) {
    console.error('Error claiming ticket:', error);
    await interaction.reply({
      content: 'Failed to claim ticket. Please try again.',
      ephemeral: true
    });
  }
}

async function handleTicketCommand(interaction: ChatInputCommandInteraction) {
  if (!client) {
    await interaction.reply({
      content: 'The bot is currently unavailable. Please try again later.',
      ephemeral: true
    });
    return;
  }

  try {
    const title = interaction.options.getString('title', true);
    const server = await storage.getServerByDiscordId(interaction.guildId!);

    if (!server) {
      await interaction.reply({
        content: "This server is not registered! Please register through the dashboard first.",
        ephemeral: true
      });
      return;
    }

    // Check subscription status
    if (!server.subscriptionStatus || server.subscriptionStatus !== 'active') {
      await interaction.reply({
        content: "This server needs an active subscription to create tickets. Please visit the dashboard to subscribe.",
        ephemeral: true
      });
      return;
    }

    const ticket = await storage.createTicket({
      serverId: server.id,
      userId: interaction.user.id,
      title,
      status: "open",
      channelId: null,
      panelId: null,
      number: 0,
      messages: []
    });

    // Create Discord channel for ticket
    const channel = await interaction.guild?.channels.create({
      name: `ticket-${ticket.id}`,
      topic: title,
      reason: `Ticket created by ${interaction.user.tag}`
    });

    if (channel) {
      await storage.updateTicket(ticket.id, {
        channelId: channel.id,
      });

      await channel.send({
        content: `Ticket created by ${interaction.user.tag}\n**${title}**\nUse the dashboard to manage this ticket.`,
      });

      await interaction.reply({
        content: `Ticket created! Check ${channel}`,
        ephemeral: true
      });
    }
  } catch (error) {
    console.error('Error handling ticket command:', error);
    await interaction.reply({
      content: 'There was an error creating your ticket. Please try again later.',
      ephemeral: true
    });
  }
}

export async function closeTicketChannel(channelId: string) {
  if (!client) {
    console.error('Cannot close ticket channel: Discord bot is not initialized');
    return;
  }

  try {
    const channel = await client.channels.fetch(channelId);
    if (channel && channel instanceof TextChannel) {
      await channel.delete();
    }
  } catch (error) {
    console.error('Error closing ticket channel:', error);
  }
}

// Updated sendWebhookMessage function
export async function sendWebhookMessage(
  channelId: string,
  content: string,
  username: string,
  anonymousMode: boolean = false,
  webhookAvatar?: string | null,
  userAvatarUrl?: string | null
) {
  if (!client) {
    console.error('Discord bot is not initialized');
    return;
  }

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !(channel instanceof TextChannel)) {
      throw new Error(`Invalid channel: ${channelId}`);
    }

    const webhooks = await channel.fetchWebhooks();
    let webhook = webhooks.find(wh => wh.name === 'Ticket System');

    if (!webhook) {
      webhook = await channel.createWebhook({
        name: 'Ticket System',
        avatar: anonymousMode && webhookAvatar ? webhookAvatar : undefined,
      });
    } else if (anonymousMode && webhookAvatar) {
      await webhook.edit({
        avatar: webhookAvatar
      });
    }

    await webhook.send({
      content,
      username: anonymousMode ? 'Support Team' : `${username} (Support Team)`,
      avatarURL: anonymousMode ? undefined : userAvatarUrl || undefined,
    });
  } catch (error) {
    console.error('Error sending webhook message:', error);
    throw error;
  }
}

async function saveTranscript(interaction: ButtonInteraction, ticketId: number) {
  try {
    const ticket = await storage.getTicket(ticketId);
    if (!ticket) {
      await interaction.reply({
        content: 'This ticket no longer exists.',
        ephemeral: true
      });
      return;
    }

    const panel = await storage.getPanel(ticket.panelId);
    if (!panel || !panel.transcriptChannelId) {
      await interaction.reply({
        content: 'No transcript channel configured for this panel.',
        ephemeral: true
      });
      return;
    }

    // Process messages for transcript
    const messages = ticket.messages ? ticket.messages.map(msg =>
      typeof msg === 'string' ? JSON.parse(msg) : msg
    ) : [];

    let transcript = `Ticket Transcript - #${ticket.number}\n`;
    transcript += `Created: ${new Date(ticket.createdAt || Date.now()).toLocaleString()}\n`;
    transcript += `Status: ${ticket.status}\n\n`;

    // Format messages with source information
    messages.forEach(msg => {
      const timestamp = new Date(msg.createdAt).toLocaleString();
      const source = msg.source === 'discord' ? '[Discord]' : '[Dashboard]';
      transcript += `[${timestamp}] ${source} ${msg.username}: ${msg.content}\n`;

      // Add attachment information
      if (msg.attachments?.length > 0) {
        msg.attachments.forEach((att: any) => {
          transcript += `  📎 Attachment: ${att.name} - ${att.url}\n`;
        });
      }
    });

    const transcriptBuffer = Buffer.from(transcript, 'utf-8');
    const transcriptAttachment = new AttachmentBuilder(
      transcriptBuffer,
      { name: `ticket-${ticket.number}-transcript.txt` }
    );

    // Send to transcript channel
    const transcriptChannel = await client?.channels.fetch(panel.transcriptChannelId) as TextChannel;
    if (transcriptChannel) {
      const transcriptEmbed = new EmbedBuilder()
        .setTitle(`Ticket #${ticket.number} Transcript`)
        .setDescription(`Transcript from ${panel.title}`)
        .addFields(
          { name: 'Created By', value: `<@${ticket.userId}>`, inline: true },
          { name: 'Closed By', value: `<@${ticket.closedBy}>`, inline: true },
          { name: 'Duration', value: formatDuration(ticket.createdAt, ticket.closedAt), inline: true }
        )
        .setColor(0x00FF00)
        .setTimestamp();

      await transcriptChannel.send({
        embeds: [transcriptEmbed],
        files: [transcriptAttachment],
      });

      await interaction.reply({
        content: `Transcript has been saved to ${transcriptChannel}.`,
        ephemeral: true
      });
    }
  } catch (error) {
    console.error('Error saving transcript:', error);
    await interaction.reply({
      content: 'Failed to save transcript. Please try again.',
      ephemeral: true
    });
  }
}

async function deleteTicketChannel(interaction: ButtonInteraction, ticketId: number) {
  try {
    const ticket = await storage.getTicket(ticketId);
    if (!ticket) {
      await interaction.reply({
        content: 'This ticket no longer exists.',
        ephemeral: true
      });
      return;
    }

    const channel = interaction.channel as TextChannel;
    await channel.delete();

    // Update ticket in database
    await storage.updateTicket(ticket.id, {
      channelId: null,
      deletedAt: new Date(),
    });
  } catch (error) {
    console.error('Error deleting ticket channel:', error);
    await interaction.reply({
      content: 'Failed to delete channel. Please try again.',
      ephemeral: true
    });
  }
}

function formatDuration(start?: Date | null, end?: Date | null): string {
  if (!start || !end) return 'Unknown';

  const duration = end.getTime() - start.getTime();
  const days = Math.floor(duration / (1000 * 60 * 60 * 24));
  const hours = Math.floor((duration % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

// Add this helper function
export async function getTicketByChannelId(channelId: string) {
  const tickets = await storage.getAllTickets();
  return tickets.find(t => t.channelId === channelId);
}

async function handleUpgradeCommand(interaction: ChatInputCommandInteraction) {
  if (!interaction.channel || !(interaction.channel instanceof TextChannel)) {
    await interaction.reply({
      content: 'This command can only be used in ticket channels.',
      ephemeral: true
    });
    return;
  }

  const ticket = await storage.getTicketByChannelId(interaction.channel.id);
  if (!ticket) {
    await interaction.reply({
      content: 'This command can only be used in ticket channels.',
      ephemeral: true
    });
    return;
  }

  const role = interaction.options.getRole('role', true);

  // Update channel permissions
  await interaction.channel.permissionOverwrites.edit(role, {
    ViewChannel: true,
    SendMessages: true,
    ReadMessageHistory: true,
    ManageMessages: true,
  });

  // Get the panel to update support roles
  const panel = await storage.getPanel(ticket.panelId);
  if (panel) {
    await storage.updatePanel(panel.id, {
      supportRoleIds: [...new Set([...panel.supportRoleIds, role.id])]
    });
  }

  const embed = new EmbedBuilder()
    .setTitle('Ticket Upgraded')
    .setDescription(`This ticket has been upgraded to include ${role}`)
    .setColor(0x00ff00)
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handleAddUserCommand(interaction: ChatInputCommandInteraction) {
  if (!interaction.channel || !(interaction.channel instanceof TextChannel)) {
    await interaction.reply({
      content: 'This command can only be used in ticket channels.',
      ephemeral: true
    });
    return;
  }

  const ticket = await storage.getTicketByChannelId(interaction.channel.id);
  if (!ticket) {
    await interaction.reply({
      content: 'This command can only be used in ticket channels.',
      ephemeral: true
    });
    return;
  }

  const user = interaction.options.getUser('user', true);

  // Update channel permissions
  await interaction.channel.permissionOverwrites.edit(user, {
    ViewChannel: true,
    SendMessages: true,
    ReadMessageHistory: true,
  });

  const embed = new EmbedBuilder()
    .setTitle('User Added')
    .setDescription(`${user} has been added to the ticket`)
    .setColor(0x00ff00)
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

// Add a new function for validating role IDs
export async function validateRoleId(guildId: string, roleId: string) {
  if (!client) throw new Error('Discord bot is not initialized');

  try {
    const guild = await client.guilds.fetch(guildId);
    const role = await guild.roles.fetch(roleId);

    if (!role) {
      return null;
    }

    return {
      id: role.id,
      name: role.name,
      color: role.color,
      position: role.position
    };
  } catch (error) {
    console.error('Error validating role:', error);
    return null;
  }
}

async function handleRemoveUserCommand(interaction: ChatInputCommandInteraction) {
  if (!interaction.channel || !(interaction.channel instanceof TextChannel)) {
    await interaction.reply({
      content: 'This command can only be used in ticket channels.',
      ephemeral: true
    });
    return;
  }

  const ticket = await storage.getTicketByChannelId(interaction.channel.id);
  if (!ticket) {
    await interaction.reply({
      content: 'This command can only be used in ticket channels.',
      ephemeral: true
    });
    return;
  }

  const user = interaction.options.getUser('user', true);

  // Remove channel permissions
  await interaction.channel.permissionOverwrites.delete(user);

  const embed = new EmbedBuilder()
    .setTitle('User Removed')
    .setDescription(`${user} has been removed from the ticket`)
    .setColor(0xFF0000)
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}