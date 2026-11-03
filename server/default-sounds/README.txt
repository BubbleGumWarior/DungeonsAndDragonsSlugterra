Drop-in sounds for the Sound Desk
==================================

Put audio files here and they appear on the DM's Sound Desk (/sound-desk)
without being uploaded -- handy for very large files such as a multi-hour
ambience track. The file name, without its extension, becomes the sound's name.

  ambient/   looping ambience beds (everyone hears them in sync)
  effects/   one-shot soundboard effects

Supported: mp3, ogg, wav, m4a, webm, flac (also aac, opus).

The folder is read when the server starts and when you press "Rescan folder"
on the Sound Desk. Removing a file from here removes it from the desk. The app
never changes or deletes the files in this folder. They are not committed to
git.
