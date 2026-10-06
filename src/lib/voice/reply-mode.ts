/** Mirror the medium: voice only answers a voice message, and an answer over 600 characters is easier to read than to hear. */
export function speakReply(heardAudio: boolean, reply: string) {
  return heardAudio && reply.length <= 600;
}
