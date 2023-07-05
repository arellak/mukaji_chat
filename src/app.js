import TelegramBot from "node-telegram-bot-api";
import winkNLP from "wink-nlp";
import model from "wink-eng-lite-web-model";
import {config} from "../config/config.js";
import {readJson, writeJson} from "./util/file.js";

const nlp = winkNLP(model);

const botToken = config.bot.token;
const bot = new TelegramBot(botToken, { polling: true });

const markovChain = readJson();
let lastBotMessage;

const getResponseByWord = (msg) => {
  const words = nlp.readDoc(msg).tokens().out();

  const chances = Object.keys(markovChain).reduce((acc, key) => {
    const containedWords = words.filter(word => key.includes(word));
    if (containedWords.length > 0 && containedWords.length >= (words.length * config.markovChain.threshold)){
      acc[key] = (containedWords.length / words.length);
    }
    return acc;
  }, {});

  const keys = Object.keys(chances);
  const randomKey = keys[Math.floor(Math.random() * keys.length)];

  if (randomKey === undefined) return msg;

  const answersKeys = Object.keys(markovChain[randomKey]);
  const randomAnswerKey = answersKeys[Math.floor(Math.random() * answersKeys.length)];

  if (randomAnswerKey === undefined) return msg;

  return randomAnswerKey;
};

const trainNew = (msg) => {
  if(msg === undefined || msg === "") return;
  if(!markovChain[lastBotMessage]){
    markovChain[lastBotMessage] = {};
  }

  if(!markovChain[lastBotMessage][msg]){
    markovChain[lastBotMessage][msg] = 0;
  }
  markovChain[lastBotMessage][msg]++;

  for(const word in markovChain){
    let total = 0;
    for(const nextWord in markovChain[word]){
      total += markovChain[word][nextWord];
    }
    for(const nextWord in markovChain[word]){
      markovChain[word][nextWord] /= total;
    }
  }
  writeJson(markovChain);
};

// const train = (msg) => {
//   if(msg?.text === undefined || msg?.text === "") return;
//   const words = nlp.readDoc(msg?.text).tokens().out();
//   for(let i = 0; i < words.length - 1; i++){
//     if(!markovChain[words[i]]){
//       markovChain[words[i]] = {};
//     }

//     if(!markovChain[words[i]][words[i + 1]]){
//       markovChain[words[i]][words[i + 1]] = 0;
//     }

//     markovChain[words[i]][words[i + 1]]++;
//   }

//   for(const word in markovChain){
//     let total = 0;
//     for(const nextWord in markovChain[word]){
//       total += markovChain[word][nextWord];
//     }
//     for(const nextWord in markovChain[word]){
//       markovChain[word][nextWord] /= total;
//     }
//   }
//   writeJson(markovChain);
// };

// const getNextState = (currentState) => {
//   const randomNumber = Math.random();
//   let probability = 0.0;
//   let nextState = currentState;

//   for(const state in markovChain[currentState]){
//     probability += markovChain[currentState][state];
//     if(randomNumber <= probability){
//       nextState = state;
//       break;
//     }
//   }

//   return nextState;
// };

// const generateReply = (startWord) => {
//   const response = getNextState(startWord);
//   if(startWord === response) return startWord;

//   return response;
// };

// const lastToken = (msg) => {
//   const words = nlp.readDoc(msg).tokens().out();
//   return (words[words.length - 1] === "?" || words[words.length - 1] === "!" || words[words.length - 1] === "." || words[words.length - 1] === ",");
// };

// const getState = (msg) => {
//   const words = nlp.readDoc(msg).sentences().out();
//   if(words.length === 1) return words[0];
//   if(words.length === 2) return words[1];
//   if(words.length === 3) return words[2];

//   for(let i = 1; i < words.length - 1; i++){
//     if(words[words.length - i] === "." || words[words.length - i] === "?" || words[words.length - i] === "!" || words[words.length - i] === ","){
//       console.log("Found punctuation, skipping...");
//       continue;
//     }
//     console.log(words[words.length - i]);
//     return words[words.length - i];
//   }
//   return "no answer...";
// };

// const handleNewMessage = (msg) => {
//   const startWord = msg.sticker ? msg.sticker?.emoji : nlp.readDoc(msg.text).sentences().out()[0];

//   return generateReply(startWord);
// };

const logConversation = (msg, reply) => {
  if(msg.from?.username === undefined){
    console.log(`${msg.from?.first_name}: ${msg.sticker ? msg.sticker.emoji : msg.text}`);
  }
  else{
    console.log(`${msg.from?.username}: ${msg.sticker ? msg.sticker.emoji : msg.text}`);
  }
  console.log(`Mukaji: ${reply}`);
};

const containsBlacklistWord = (msg) => {
  const words = nlp.readDoc(msg).tokens().out();
  // @ts-ignore
  const containedWords = words.filter(word => config.blacklist.includes(word));
  return containedWords.length > 0;
};

// bot.onText(/\/stats/, (msg) => {});

bot.onText(/\/start/, (msg) => {
  // eslint-disable-next-line no-return-assign
  bot.sendMessage(msg.chat.id, "Hey").then(message => {
    lastBotMessage = message?.text;
    trainNew("Hey");
  });
});

bot.on("message", (msg) => {
  if(Object.keys(markovChain).length === 0 && msg.text !== "/start"){
    bot.sendMessage(msg.chat.id, "Please start with /start");
    return;
  }

  console.log("===========================================");
  if(msg.text?.startsWith("/")) return;
  if(msg.audio || msg.video || msg.photo || msg.document){
    bot.sendMessage(msg.chat.id, "Sorry, I can't handle media...");
    console.log("media found, skipping...");
    console.log("===========================================");
    return;
  }
  if(containsBlacklistWord(msg.text)){
    // get a random answer from config.blacklistAnswers
    const randomAnswer = config.blacklist_responses[Math.floor(Math.random() * config.blacklist_responses.length)];
    bot.sendMessage(msg.chat.id, randomAnswer);
    console.log("blacklisted word found, skipping...");
    console.log("===========================================");
    return;
  }

  if(lastBotMessage === undefined){
    lastBotMessage = "hey";
  }
  trainNew(msg?.text);
  const reply = getResponseByWord(msg?.text);
  lastBotMessage = reply;
  logConversation(msg, reply === "" ? "Couldn't find an answer, sorry..." : reply);
  bot.sendMessage(msg.chat.id, reply === "" ? "Couldn't find an answer, sorry..." : reply);
  console.log("===========================================");
});
