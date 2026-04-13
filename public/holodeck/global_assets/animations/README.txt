HOW TO ADD MIXAMO ANIMATIONS
=============================

1. Go to https://www.mixamo.com/ and sign in (free Adobe account)

2. Pick any animation you like (e.g., Idle, Walking, Dancing, Waving)

3. Click "DOWNLOAD" with these settings:
   - Format: FBX Binary (.fbx)
   - Skin: WITHOUT SKIN  <-- Important! We only need the animation data
   - Frames per second: 30
   - Keyframe Reduction: none (or default)

4. Save the .fbx file into this /animations/ folder

5. Open js/config.js and add an entry to the ANIMATION_FILES array:

   export const ANIMATION_FILES = [
       { name: 'Idle', file: 'animations/idle.fbx' },
       { name: 'Walk', file: 'animations/walking.fbx' },
       // Add more here...
   ];

6. Refresh the browser — your new animation button will appear!

TIPS:
- The "name" is what shows on the button in the UI
- The "file" path is relative to the project root
- You can add as many animations as you want
- If an animation looks wrong, try re-downloading with "Without Skin" selected
