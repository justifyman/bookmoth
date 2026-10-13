import type { Problem } from '../db/schema'

// Every way an import can go wrong, written for readers rather than developers.

export class ImportProblem extends Error {
  problem: Problem
  constructor(problem: Problem) {
    super(problem.title)
    this.problem = problem
  }
}

export const PROBLEMS = {
  unsupported: (ext: string): Problem => {
    const kindle = ['mobi', 'azw', 'azw3', 'kfx'].includes(ext)
    const oldWord = ext === 'doc'
    return {
      title: 'Lumen can’t open this kind of file yet',
      detail: 'It reads EPUB, PDF, Word (.docx) and plain text files.',
      hint: kindle
        ? 'Kindle books usually only open in Kindle apps. If the shop offers an EPUB version, try that.'
        : oldWord
          ? 'Open it in Word and choose “Save as” .docx, then add that file.'
          : 'If you have the book in one of those formats, add that file instead.',
    }
  },
  protected: (): Problem => ({
    title: 'This book is copy-protected',
    detail: 'The shop it came from has locked it so that only their own app can open it. Lumen can’t unlock it.',
    hint: 'Look for a copy sold without protection, or try a free public-domain edition.',
  }),
  damaged: (): Problem => ({
    title: 'This file seems to be damaged',
    detail: 'Lumen couldn’t read it all the way through. It may not have finished downloading.',
    hint: 'Try downloading or copying the file again, then add it once more.',
  }),
  passwordPdf: (): Problem => ({
    title: 'This PDF is locked with a password',
    detail: 'Lumen can’t ask for the password yet.',
    hint: 'Open it in a PDF app, save a copy without the password, and add that copy.',
  }),
  empty: (): Problem => ({
    title: 'There’s nothing to read in this file',
    detail: 'Lumen opened it but didn’t find any text inside.',
    hint: 'Check that it’s the right file.',
  }),
  scannedPdf: (): Problem => ({
    title: 'This PDF is made of pictures of pages',
    detail: 'It looks like a scan, so there is no text for Lumen to reflow. Fonts, themes and the 3D book need real text.',
    hint: 'You can still read it page by page, just as it was scanned.',
  }),
  tooSlow: (): Problem => ({
    title: 'This book took too long to read',
    detail: 'Lumen gave up after a few minutes so your other books weren’t kept waiting.',
    hint: 'Very large or unusual files can do this. Try adding it again on its own.',
  }),
  unknown: (): Problem => ({
    title: 'Something went wrong adding this book',
    detail: 'Lumen couldn’t finish reading the file.',
    hint: 'Try adding it again. If it keeps happening, the file may be damaged.',
  }),
}
