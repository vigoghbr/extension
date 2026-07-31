version:
	@if [ -z "$(word 2,$(MAKECMDGOALS))" ]; then \
		echo "Usage: make version <x.y.z>"; \
		exit 1; \
	fi
	@perl -pi -e 's/"version": "[^"]*"/"version": "$(word 2,$(MAKECMDGOALS))"/' package.json manifest.json
	@echo "🔖 version set to $(word 2,$(MAKECMDGOALS))"

%:
	@:

lint:
	npm run lint:fix

build: lint
	npm run build

zip: build
	cd dist && zip -r ../extension.zip .
	@size=$$(du -k extension.zip | cut -f1); echo "📦 extension.zip — $${size} KB"

remove-zip:
	rm -f extension.zip
