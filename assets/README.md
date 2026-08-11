# App icons & splash

Drop your source images in this folder, then run:

```
npm run icons
```

That regenerates every Android launcher icon size and the splash screen,
then syncs them into the app.

## What to add

| File                        | Size      | Notes                                                        |
| --------------------------- | --------- | ------------------------------------------------------------ |
| `icon.png`                  | 1024x1024 | Main app icon, **no transparency** (full-bleed square)       |
| `icon-foreground.png`       | 1024x1024 | Foreground layer for Android adaptive icons (transparency ok)|
| `icon-background.png`       | 1024x1024 | Solid background color/image for adaptive icons              |
| `splash.png`                | 2732x2732 | Splash image, safe area centered (logos shrink 66%)          |

`icon.png` is required; the others are optional (defaults are used).

## Then build the APK

```
npm run android:sync
npx cap open android
```

Build the APK in Android Studio as before.
