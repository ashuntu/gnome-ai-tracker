NAME=gnome-ai-tracker
DOMAIN=ashuntu.github.io
SCHEMA_DIR=schemas
COMPILED_SCHEMA=$(SCHEMA_DIR)/gschemas.compiled

.PHONY: all pack install clean run

all: dist/extension.js $(COMPILED_SCHEMA)

node_modules/.bun-install: package.json
	bun install
	@touch node_modules/.bun-install

dist/extension.js: node_modules/.bun-install *.ts
	bun run build

$(COMPILED_SCHEMA): $(SCHEMA_DIR)/*.gschema.xml
	glib-compile-schemas $(SCHEMA_DIR)

$(NAME).zip: dist/extension.js $(COMPILED_SCHEMA)
	@cp metadata.json dist/
	@cp stylesheet.css dist/
	@mkdir -p dist/schemas
	@cp $(SCHEMA_DIR)/*.gschema.xml dist/schemas/
	@cp $(COMPILED_SCHEMA) dist/schemas/
	@mkdir -p dist/icons
	@cp icons/* dist/icons/
	@(cd dist && zip ../$(NAME).zip -9r .)

pack: $(NAME).zip

install: $(NAME).zip
	gnome-extensions install --force $(NAME).zip

clean:
	@rm -rf dist node_modules bun.lock $(NAME).zip $(COMPILED_SCHEMA)

run:
	gnome-extensions disable $(NAME)@$(DOMAIN)
	make install
	gnome-extensions enable $(NAME)@$(DOMAIN)
	dbus-run-session gnome-shell --devkit --wayland
