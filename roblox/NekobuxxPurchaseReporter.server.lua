-- Taruh file ini sebagai ServerScript di ServerScriptService.
-- Jangan taruh API_SECRET di LocalScript atau ReplicatedStorage.

local HttpService = game:GetService("HttpService")
local MarketplaceService = game:GetService("MarketplaceService")

local API_URL = "https://GANTI-DOMAIN-BOT-KAMU.up.railway.app/api/purchases"
local API_SECRET = "9e69927bfb8f11a05c7d3cd3bcf9a282f54b7648dfea4d36e1b8916ed6e5da29"
local MIN_ITEM_PRICE = 30

local function reportPurchase(player, assetId)
	local infoSuccess, productInfo = pcall(function()
		return MarketplaceService:GetProductInfo(assetId, Enum.InfoType.Asset)
	end)
	if not infoSuccess then
		warn("[Nekobuxx] Gagal mengambil info item:", productInfo)
		return
	end

	local price = tonumber(productInfo.PriceInRobux)
	if not price or price < MIN_ITEM_PRICE then
		return
	end

	-- Pemeriksaan tambahan; screenshot tetap menjadi audit akhir saat claim.
	local ownsSuccess, ownsAsset = pcall(function()
		return MarketplaceService:PlayerOwnsAsset(player, assetId)
	end)
	if not ownsSuccess or not ownsAsset then
		warn("[Nekobuxx] Kepemilikan item belum dapat dikonfirmasi:", assetId)
		return
	end

	local payload = {
		eventId = game.JobId .. ":" .. HttpService:GenerateGUID(false),
		robloxUserId = player.UserId,
		robloxUsername = player.Name,
		assetId = assetId,
		assetName = tostring(productInfo.Name or ("Asset " .. assetId)),
		priceRobux = price,
		purchasedAt = os.date("!%Y-%m-%dT%H:%M:%SZ")
	}

	local requestSuccess, response = pcall(function()
		return HttpService:RequestAsync({
			Url = API_URL,
			Method = "POST",
			Headers = {
				["Content-Type"] = "application/json",
				["Authorization"] = "Bearer " .. API_SECRET
			},
			Body = HttpService:JSONEncode(payload)
		})
	end)

	if not requestSuccess or not response.Success then
		warn("[Nekobuxx] Gagal mencatat pembelian:", requestSuccess and response.StatusCode or response)
	end
end

MarketplaceService.PromptPurchaseFinished:Connect(function(player, assetId, isPurchased)
	if isPurchased then
		task.spawn(reportPurchase, player, assetId)
	end
end)
