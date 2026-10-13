# Architecture diagrams

Each `.mmd` file produces an adaptive SVG and light and dark PNGs. The architecture guide uses normal Markdown image links to the SVGs. Browsers select the SVG theme with `prefers-color-scheme`. MmdToImg selects the PNG that matches the Neovim background.

MmdToImg renders a diagram when you save its `.mmd` source in Neovim. To regenerate all diagrams, run:

```vim
:MmdToImgAll docs/architecture/diagrams
```

MmdToImg contains the renderer and theme configuration. It requires the Mermaid CLI (`mmdc`) on your PATH. Commit the generated images with their sources so readers can view the diagrams without Neovim.
